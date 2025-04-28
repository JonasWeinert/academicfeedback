import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenAI,
  Type,
  // GenerateContentResponse // Not explicitly used, can be removed if desired
  HarmCategory, // Import HarmCategory
  HarmBlockThreshold // Import HarmBlockThreshold
} from "@google/genai";

const MODEL_NAME = "gemini-2.5-pro-preview-03-25";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({apiKey: apiKey});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    overall_feedback: {
      type: Type.STRING,
      description: "General assessment of the proposal, summarizing strengths and weaknesses."
    },
    passages: {
      type: Type.ARRAY,
      description: "Specific feedback points linked to exact text passages from the proposal.",
      items: {
        type: Type.OBJECT,
        properties: {
          referenced_student_text_quote: {
            type: Type.STRING,
            description: "The exact, full quote from the student's proposal being commented on. Do not use ellipses."
          },
          feedback: {
            type: Type.STRING,
            description: "Constructive feedback related to the referenced quote."
          },
          quote_from_marking_guidelines: {
            type: Type.STRING,
            description: "Optional: The specific guideline text relevant to this feedback point.",
            nullable: true
          }
        },
        required: [
          "referenced_student_text_quote",
          "feedback"
        ]
      }
    },
    examination: {
      type: Type.ARRAY,
      description: "Structured assessment based on predefined examination areas.",
      items: {
        type: Type.OBJECT,
        properties: {
          area_of_examination: {
            type: Type.STRING,
            description: "The specific area being assessed (e.g., 'Clarity of Research Question', 'Methodology', 'Literature Review')."
          },
          assessment_comment: {
            type: Type.STRING,
            description: "Detailed comments on the student's performance in this area."
          },
          "suggestion for improvement": {
            type: Type.STRING,
            description: "Actionable suggestions for the student to improve this area.",
            nullable: true
          },
          assesment_category: { // Consider fixing typo: assessment_category
            type: Type.STRING,
            description: "Overall rating for this area. Must be one of: 'excellent', 'sufficient with room for improvement', 'insufficient'."
          }
        },
        required: [
          "area_of_examination",
          "assessment_comment",
          "assesment_category" // Matches typo above
        ]
      }
    }
  },
  required: [
    "overall_feedback",
    "passages",
    "examination"
  ]
};

// Define safety settings using imported enums
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];


export async function POST(request: NextRequest) {
  try {
    const { markdownProposal, assessmentGuidelines } = await request.json();

    if (!markdownProposal || !assessmentGuidelines) {
      return NextResponse.json({ error: 'Missing proposal or guidelines' }, { status: 400 });
    }

    const baseSystemInstruction = `You are a professor that provides feedback on a first year phd students thesis proposal.

Be very hard but constructive in your feedback applying highest academic standards.

Please provide overall feedback plus sentence/ paragraph specific annotations. For the annotations, please reference the FULL quote from the student proposal that your annotation belongs to. Do NOT abbreviate with ... in between. ALWAYS return the full quote.

Here are your marking guidelines:`;
    const fullSystemInstruction = `${baseSystemInstruction}\n\n${assessmentGuidelines}`;

    console.log("Sending request to Gemini API...");

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [{ text: markdownProposal }]
        }
      ],
      config: {
        safetySettings: safetySettings,
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        systemInstruction: fullSystemInstruction
        // Note: responseMimeType is implicitly application/json when responseSchema is provided
      }
    });

    console.log("Received response from Gemini API.");

    try {
      // Find the first '{' and the last '}' to extract the JSON part
      const responseText = response.text ?? "";
      const startIndex = responseText.indexOf('{');
      const endIndex = responseText.lastIndexOf('}');

      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
          console.error("Gemini API response did not contain a valid JSON object structure:", responseText);
          throw new Error(`Response did not contain valid JSON structure. Raw output: ${responseText}`);
      }

      const jsonString = responseText.substring(startIndex, endIndex + 1);
      const feedbackJson = JSON.parse(jsonString);

      return NextResponse.json({
        feedback: feedbackJson,
        usage: response.usageMetadata || {}
      });
    } catch (parseError: any) { // Catch specific error types if needed
      console.error("Failed to parse JSON from Gemini API response:", parseError);
      // Include the raw text in the error log for debugging
      console.error("Raw response text:", response.text ?? "No response text");
      // Provide a slightly more informative error message back to the client
      return NextResponse.json({ error: `Failed to parse feedback from AI. Check server logs for details. Error: ${parseError.message}` }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Ensure error.cause is logged if it exists
    if (error.cause) {
      console.error("Fetch Error Cause:", error.cause);
    }
    // Log the error message itself
    console.error("Error Message:", error.message);
    return NextResponse.json({ error: 'Failed to get feedback from AI.' }, { status: 500 });
  }
} 