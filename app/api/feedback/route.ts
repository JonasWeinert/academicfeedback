import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenAI,
  Type,
  // GenerateContentResponse // Not explicitly used, can be removed if desired
  HarmCategory, // Import HarmCategory
  HarmBlockThreshold // Import HarmBlockThreshold
} from "@google/genai";

const MODEL_NAME = "gemini-2.5-pro-preview-03-25";

// Function to get API key from request headers or environment variable
const getApiKey = (request: NextRequest): string => {
  // Get auth method from headers (if sent from client)
  const authMethod = request.headers.get('x-auth-method');
  const apiKeyFromRequest = request.headers.get('x-gemini-api-key');
  
  // Only use the API key from request if it exists and auth method is api_key
  if (authMethod === 'api_key' && apiKeyFromRequest) {
    return apiKeyFromRequest;
  }
  
  // For password auth method or if no auth method specified, use env variable
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set and no API key provided in request.");
  }
  
  return apiKey;
};

// Initialize GoogleGenAI with the API key from parameters
const initializeAI = (apiKey: string) => {
  return new GoogleGenAI({apiKey});
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    overall_feedback: {
      type: Type.STRING,
      description: "General assessment of the document, summarizing strengths and weaknesses."
    },
    passages: {
      type: Type.ARRAY,
      description: "Specific feedback points linked to exact text passages from the document.",
      items: {
        type: Type.OBJECT,
        properties: {
          referenced_student_text_quote: {
            type: Type.STRING,
            description: "The exact, full quote from the student's document being commented on. Do not use ellipses."
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

// Helper function to get the appropriate prompt based on document type and harshness
function getSystemPrompt(documentType: string, harshness: string, guidelines: string) {
  // Base prompt parts
  let rolePrefix = "You are a professor that provides feedback on ";
  let documentDescription = documentType === "proposal" 
    ? "a first year phd student's thesis proposal" 
    : "an academic paper draft";
  
  // Harshness level text
  let harshnessText;
  switch (harshness) {
    case "mild":
      harshnessText = "Be constructive and encouraging in your feedback while still pointing out areas for improvement.";
      break;
    case "tough":
      harshnessText = "Be constructive but firm in your feedback, applying high academic standards.";
      break;
    case "extremely_tough":
      harshnessText = "Be very hard but constructive in your feedback, applying the highest academic standards. Be nit-picky and detail-oriented.";
      break;
    default:
      harshnessText = "Be constructive in your feedback applying high academic standards.";
  }
  
  // Construct the full prompt
  const baseSystemInstruction = `${rolePrefix}${documentDescription}.

${harshnessText}

Please provide overall feedback plus sentence/paragraph specific annotations. For the annotations, please reference the FULL quote from the document that your annotation belongs to. Do NOT abbreviate with ... in between. ALWAYS return the full quote.

Here are your marking guidelines:`;

  return `${baseSystemInstruction}\n\n${guidelines}`;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getApiKey(request);
    const ai = initializeAI(apiKey);

    const { markdownProposal, assessmentGuidelines, documentType = "proposal", harshness = "tough" } = await request.json();

    if (!markdownProposal || !assessmentGuidelines) {
      return NextResponse.json({ error: 'Missing document text or guidelines' }, { status: 400 });
    }

    const fullSystemInstruction = getSystemPrompt(documentType, harshness, assessmentGuidelines);

    console.log("Sending request to Gemini API...");

    // First request to get the structured feedback
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
      }
    });

    console.log("Received response from Gemini API.");
    
    // Log important parts for debugging
    console.log("Response candidates:", response.candidates);
    console.log("Response promptFeedback:", response.promptFeedback);

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
      
      // Make a second, separate request to get the reasoning
      let aiReasoning = null;
      try {
        // Only make this request if we successfully got structured feedback
        const reasoningResponse = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: "user",
              parts: [{ text: `Given the following ${documentType === "proposal" ? "proposal" : "academic paper draft"}, explain your thinking process for the feedback (but don't provide the feedback itself again):
              
${markdownProposal.substring(0, 5000)}... [truncated for brevity]` }]
            }
          ],
          config: {
            safetySettings: safetySettings,
            temperature: 0.7,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 2048,
            systemInstruction: fullSystemInstruction
          }
        });
        
        aiReasoning = reasoningResponse.text || null;
        console.log("Generated AI reasoning:", aiReasoning);
      } catch (reasoningError) {
        console.error("Error getting AI reasoning:", reasoningError);
        // Don't fail the whole request if reasoning fails
      }

      return NextResponse.json({
        feedback: feedbackJson,
        usage: response.usageMetadata || {},
        reasoning: aiReasoning
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