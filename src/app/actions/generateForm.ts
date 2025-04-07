"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveForm } from "./mutateForm";
import { v4 as uuidv4 } from "uuid";

import { GoogleGenerativeAI } from "@google/generative-ai";
const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export async function generateForm(
  prevState: {
    message: string;
  },
  formData: FormData
) {
  const schema = z.object({
    description: z.string().min(1),
  });
  const parse = schema.safeParse({
    description: formData.get("description"),
  });

  if (!parse.success) {
    console.log(parse.error);
    return {
      message: "Failed to parse data",
    };
  }

  const data = parse.data;
  console.log(data);

  try {
    console.log("indside");
    const prompt = `${data.description} Based on the description, generate a survey object with 3 fields: name(string) for the form, description(string) of the form and a questions array where every element has 2 fields: text and fieldType. Use only 'Textarea' as the fieldType for all questions and return it in json format. Include empty fieldOptions array for each question. Generate at least 10 questions covering all required sections.`;    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const extractJSON = (text: string) => {
      // Try to find JSON between code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim();
      }
      
      // If no code blocks, try to extract JSON directly
      try {
        // Find the first { and last }
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          return text.substring(firstBrace, lastBrace + 1);
        }
      } catch (e) {
        console.error("Failed to extract JSON:", e);
      }
      
      // Return the original text if all else fails
      return text;
    };
    const jsonString = extractJSON(text);
let responseObject;
try {
  responseObject = JSON.parse(jsonString);
} catch (e) {
  console.error("Failed to parse JSON:", e, "Raw text:", text);
  throw new Error("Failed to parse response from AI");
}
    

    const dbFormId = await saveForm({
      user_prompt: data.description,
      name: responseObject.name,
      description: responseObject.description,
      questions: responseObject.questions,
    });

    console.log("getting form id", dbFormId);

    revalidatePath("/");
    return {
      message: "success",
      data: { formId: dbFormId },
    };
  } catch (err) {
    console.log(err);
    return {
      message: "Failed to create form",
    };
  }
}
