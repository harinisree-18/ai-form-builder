"use client";

import React, { useEffect, useState } from "react";
import {
  FormSelectModel,
  QuestionSelectModel,
  FieldOptionSelectModel,
} from "@/types/form-types";
import {
  Form as FormComponent,
  FormField as ShadcdnFormField,
  FormItem,
  FormLabel,
  FormControl,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import FormField from "./FormField";
import { addMoreQuestion, publishForm } from "../actions/mutateForm";
import { ThemeChange } from "@/components/ui/ThemeChange";
import FormPublishSucces from "./FormPublishSucces";
import { deleteForm } from "../actions/mutateForm";
import { Trash2, RotateCw, RefreshCcw, Loader, Pencil, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@radix-ui/react-icons";
import { db } from "@/db";
import { InferInsertModel } from "drizzle-orm";
import { getCurrentForm } from "../actions/getUserForms";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { forms, questions as dbQuestions, fieldOptions } from "@/db/schema";
const API_KEY = process.env.GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

type Props = {
  form: Form;
  editMode?: boolean;
};

type QuestionWithOptionsModel = QuestionSelectModel & {
  fieldOptions: Array<FieldOptionSelectModel>;
};

interface Form extends FormSelectModel {
  questions: Array<QuestionWithOptionsModel>;
}

interface AllQuestionModel extends Array<string> {}

type Question = InferInsertModel<typeof dbQuestions>;

const fieldTypes = [
  { label: "Short Text", value: "Input" },
  { label: "Long Text", value: "Textarea" },
  { label: "Multiple Choice", value: "MULTIPLE_CHOICE" },
  { label: "Checkbox", value: "CHECKBOX" },
];

const Form = (props: Props) => {
  const [prompt, setPrompt] = useState<string>("");
  const [newPrompt, setNewPrompt] = useState<string>("");
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [currentFormId, setCurrentFormId] = useState({ formID: "", id: 0 });
  const [addingNewFields, setAddingNewFields] = useState(false);
  const [toatalQuestions, setTotalQuestions] = useState(0);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [manualFieldOpen, setManualFieldOpen] = useState(false);
  const [newFieldType, setNewFieldType] = useState("Input");
  const [newFieldQuestion, setNewFieldQuestion] = useState("");
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([""]);
  const [addingManualField, setAddingManualField] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [generatingFromPrompt, setGeneratingFromPrompt] = useState(false);

  const { name, description, questions } = props.form;
  const form = useForm();
  const { editMode } = props;
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [deletingForm, setDeletingForm] = useState(false);
  const router = useRouter();

  const onSubmit = async (data: any) => {
    console.log(data);
    if (editMode && props.form.formID !== null) {
      await publishForm(props.form.formID);
      setSuccessDialogOpen(true);
    } else {
      setSubmittingForm(true);
      let answers = [];
      for (const [questionId, value] of Object.entries(data)) {
        const id = parseInt(questionId.replace("question_", ""));
        let fieldOptionsId = null;
        let textValue = null;

        if (typeof value == "string" && value.includes("answerId_")) {
          fieldOptionsId = parseInt(value.replace("answerId_", ""));
        } else {
          textValue = value as string;
        }

        answers.push({
          questionId: id,
          fieldOptionsId,
          value: textValue,
        });
      }

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

      try {
        const response = await fetch(`${baseUrl}/api/form/new`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ formId: props.form.id, answers }),
        });
        
        if (response.ok) {
          router.push(`/forms/${props.form.formID}/success`);
        } else {
          const errorData = await response.text();
          console.error("Error submitting form:", errorData);
          alert("Error submitting form. Please try again later");
        }
      } catch (error) {
        console.error("Error submitting form:", error);
        alert("Error submitting form. Please try again later");
      } finally {
        setSubmittingForm(false);
      }
    }
  };

  const handleDialogChange = (open: boolean) => {
    setSuccessDialogOpen(open);
  };

  const handleDeleteForm = async () => {
    try {
      setDeletingForm(true);
      await deleteForm(props.form.formID || "");
      router.push("/view-forms");
    } catch (err) {
      console.log(err);
    } finally {
      setDeletingForm(false);
    }
  };

  

  const getCurrentFormInfo = async () => {
    try {
      const response = await getCurrentForm(props.form.formID || "");
      if (response) {
        setPrompt(response?.user_prompt || "");
        const currentQuestions = response?.questions
          .map((question) => question.text)
          .filter(Boolean) as AllQuestionModel;
        setAllQuestions(currentQuestions);
        setTotalQuestions(response.questions.length);
        setCurrentFormId({ formID: response?.formID || "", id: response.id });
      } else {
        console.log("Form not found.");
      }
    } catch (err) {
      console.log("Error occurred while fetching current form:", err);
    }
  };

  const handleAllMoreQuestions = async () => {
    try {
      setAddingNewFields(true);
      const resp = await addMoreQuestion(
        prompt,
        currentFormId.id,
        props.form.formID || "",
        allQuestions.join(",")
      );
      
      // Make sure resp is an array before proceeding
      if (Array.isArray(resp) && resp.length > 0) {
        setAllQuestions((prevQuestions) => [...prevQuestions, ...resp]);
        setTotalQuestions((prev) => prev + resp.length);
        router.refresh();
      } else {
        console.log("Response is not a valid array:", resp);
        alert("Failed to generate additional questions. Please try again.");
      }
    } catch (err) {
      console.error("Error generating questions:", err);
      alert("Error generating questions. Please try again.");
    } finally {
      setAddingNewFields(false);
    }
  };

  const handlePromptGeneration = async () => {
    if (!newPrompt.trim()) {
      alert("Please enter a prompt");
      return;
    }

    try {
      setGeneratingFromPrompt(true);
      
      // Use the existing addMoreQuestion function but with the new prompt
      const resp = await addMoreQuestion(
        newPrompt,
        currentFormId.id,
        props.form.formID || "",
        allQuestions.join(",")
      );
      
      // Make sure resp is an array before proceeding
      if (Array.isArray(resp) && resp.length > 0) {
        setAllQuestions((prevQuestions) => [...prevQuestions, ...resp]);
        setTotalQuestions((prev) => prev + resp.length);
        setPromptDialogOpen(false);
        setNewPrompt(""); // Reset the prompt field
        router.refresh();
      } else {
        console.log("Response is not a valid array:", resp);
        alert("Failed to generate fields from prompt. Please try again.");
      }
    } catch (err) {
      console.error("Error generating fields from prompt:", err);
      alert("Error generating fields. Please try again.");
    } finally {
      setGeneratingFromPrompt(false);
    }
  };

  const addOptionField = () => {
    setNewFieldOptions([...newFieldOptions, ""]);
  };

  const updateOptionField = (index: number, value: string) => {
    const updatedOptions = [...newFieldOptions];
    updatedOptions[index] = value;
    setNewFieldOptions(updatedOptions);
  };

  const removeOptionField = (index: number) => {
    if (newFieldOptions.length > 1) {
      const updatedOptions = [...newFieldOptions];
      updatedOptions.splice(index, 1);
      setNewFieldOptions(updatedOptions);
    }
  };

  const handleAddManualField = async () => {
    if (!newFieldQuestion.trim()) {
      alert("Please enter a question");
      return;
    }

    if ((newFieldType === "MULTIPLE_CHOICE" || newFieldType === "CHECKBOX") && 
        newFieldOptions.filter(opt => opt.trim()).length < 2) {
      alert("Please add at least two options for multiple choice or checkbox questions");
      return;
    }

    try {
      setAddingManualField(true);
      
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      const response = await fetch(`${baseUrl}/api/form/field`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formId: props.form.id,
          formUID: props.form.formID,
          questionText: newFieldQuestion,
          fieldType: newFieldType,
          options: newFieldType === "MULTIPLE_CHOICE" || newFieldType === "CHECKBOX" 
            ? newFieldOptions.filter(opt => opt.trim()) 
            : []
        }),
      });

      if (response.ok) {
        // Reset form and refresh
        setNewFieldQuestion("");
        setNewFieldType("Input");
        setNewFieldOptions([""]);
        setManualFieldOpen(false);
        
        // Refresh the page to show new field
        router.refresh();
        // Update questions count
        getCurrentFormInfo();
      } else {
        const errorData = await response.text();
        console.error("Failed to add field:", errorData);
        alert("Failed to add field. Please try again.");
      }
    } catch (err) {
      console.error("Error adding manual field:", err);
      alert("Error adding field. Please try again.");
    } finally {
      setAddingManualField(false);
    }
  };

  useEffect(() => {
    getCurrentFormInfo();
  }, []);

  return (
    <div className="text-center min-w-[320px] md:min-w-[540px] max-w-[620px] border px-8 py-4 rounded-md bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-md bg-opacity-10 border-gray-100">
      <div className="hidden">
        <ThemeChange />
      </div>
      <div className="flex items-center justify-center gap-2">
        <h1 className="text-3xl font-semibold py-3 text-red">{name}</h1>

        {editMode && !deletingForm && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Trash2
                  className="hover:text-red-900 hover:cursor-pointer"
                  onClick={handleDeleteForm}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete this form!</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {editMode && deletingForm && <RotateCw className="animate-spin" />}
      </div>

      <h3 className="text-md italic">{description}</h3>
      <FormComponent {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid w-full max-w-3xl items-center gap-6 my-4 text-left"
        >
          {questions.map(
            (question: QuestionWithOptionsModel, index: number) => {
              return (
                <ShadcdnFormField
                  control={form.control}
                  name={`question_${question.id}`}
                  key={`${question.text}_${index}`}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-around items-center">
                        <FormLabel className="text-base mt-3 mr-3 flex-1">
                          {index + 1}. {question.text}
                        </FormLabel>
                      </div>
                      <FormControl>
                        <FormField
                          element={question}
                          key={index}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              );
            }
          )}
          
          {editMode && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                {toatalQuestions < 8 && (
                  <Button
                    onClick={handleAllMoreQuestions}
                    type="button"
                    variant="outline"
                    disabled={addingNewFields}
                    className="flex-1"
                  >
                    {!addingNewFields ? (
                      <>
                        <RefreshCcw className="mr-3" />
                        Generate Fields
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="mr-3 animate-spin" />
                        Generating...
                      </>
                    )}
                  </Button>
                )}
                
                <Button
                  onClick={() => setManualFieldOpen(true)}
                  type="button"
                  variant="outline"
                  className="flex-1"
                >
                  <Plus className="mr-3" />
                  Add Custom Field
                </Button>
              </div>
              
              <Button 
                onClick={() => setPromptDialogOpen(true)}
                type="button"
                variant="outline"
              >
                <Pencil className="mr-3" />
                Add Fields with Prompt
              </Button>
              
              {prompt && (
                <div className="text-sm text-gray-500 italic">
                  Current form prompt: &quot;{prompt}&quot;
                </div>
              )}
            </div>
          )}

          <Button type="submit" disabled={submittingForm}>
            {editMode ? (
              "Publish"
            ) : submittingForm ? (
              <>
                <Loader className="mr-3 animate-spin" />
                Submitting
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </form>
      </FormComponent>

      <FormPublishSucces
        formId={props.form.formID || ""}
        open={successDialogOpen}
        onOpenChange={handleDialogChange}
      />

      {/* Manual Field Addition Dialog */}
      <Dialog open={manualFieldOpen} onOpenChange={setManualFieldOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Custom Form Field</DialogTitle>
            <DialogDescription>
              Create a custom field for your form. Configure the question and field type.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="question" className="text-sm font-medium">
                Question Text
              </label>
              <Input
                id="question"
                value={newFieldQuestion}
                onChange={(e) => setNewFieldQuestion(e.target.value)}
                placeholder="Enter your question..."
                className="col-span-3"
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="fieldType" className="text-sm font-medium">
                Field Type
              </label>
              <Select 
                value={newFieldType} 
                onValueChange={value => {
                  setNewFieldType(value);
                  if (value === "MULTIPLE_CHOICE" || value === "CHECKBOX") {
                    setNewFieldOptions(["", ""]);
                  } else {
                    setNewFieldOptions([""]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a field type" />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Options for multiple choice or checkbox */}
            {(newFieldType === "MULTIPLE_CHOICE" || newFieldType === "CHECKBOX") && (
              <div className="grid gap-3">
                <label className="text-sm font-medium">Options</label>
                {newFieldOptions.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(e) => updateOptionField(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1"
                    />
                    {newFieldOptions.length > 2 && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeOptionField(index)}
                      >
                        <Trash2 size={18} />
                      </Button>
                    )}
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm" 
                  type="button" 
                  onClick={addOptionField}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add Option
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              onClick={handleAddManualField} 
              disabled={addingManualField}
            >
              {addingManualField ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Field"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Prompt Dialog for Adding Fields */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Fields with Prompt</DialogTitle>
            <DialogDescription>
              Describe the fields you want to add, and we&apos;ll generate them for you.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="promptText" className="text-sm font-medium">
                What fields would you like to add?
              </label>
              <Textarea
                id="promptText"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="e.g., Add fields for collecting customer feedback about our support service, including rating scales and open comments"
                rows={4}
                className="resize-none"    
              />
            </div>
            
            {prompt && (
              <div className="text-sm">
                <p className="font-medium">Original form prompt:</p>
                <p className="text-gray-500 italic">&quot;{prompt}&quot;</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              onClick={handlePromptGeneration} 
              disabled={generatingFromPrompt || !newPrompt.trim()}
            >
              {generatingFromPrompt ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Generate Fields
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Form;