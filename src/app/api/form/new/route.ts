
import { db } from "@/db";
import { questions, fieldOptions } from "@/db/schema";

export async function POST(request: Request): Promise<Response> {
  try {
    const data = await request.json();
    const { formId, formUID, questionText, fieldType, options } = data;

    console.log("Adding question with:", {
      formId,
      text: questionText,
      fieldType: fieldType
    });

    // Insert the new question with the field type
    const [newQuestion] = await db
      .insert(questions)
      .values({
        formId: formId,
        text: questionText,
        fieldType: fieldType,
      })
      .returning({
        id: questions.id,
        text: questions.text,
        fieldType: questions.fieldType
      });

    // If multiple choice or checkbox, add options
    if ((fieldType === "MULTIPLE_CHOICE" || fieldType === "CHECKBOX") && options && options.length > 0) {
      const optionsToInsert = options.map((option: string) => ({
        questionId: newQuestion.id,
        text: option,
        value: option
      }));

      await db.insert(fieldOptions).values(optionsToInsert);
    }

    return Response.json({
      success: true,
      message: "Field added successfully",
      question: newQuestion
    }, { status: 200 });
  } catch (error) {
    console.error("Error adding custom field:", error);
    
    // More detailed error logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    console.error("Details:", { message: errorMessage, stack });
    
    return Response.json({
      success: false,
      message: "Failed to add field",
      error: errorMessage
    }, { status: 500 });
  }
}
