import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-1.5-flash";
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({apiKey: apiKey});

// Helper function to extract main terms from a document text
function extractBasicTerms(text: string): string[] {
  // Remove common stop words
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around', 'among']);
  
  // Find most common meaningful words
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
    .split(/\s+/)              // Split on whitespace
    .filter(word => word.length > 4 && !stopWords.has(word)); // Filter short words and stop words
  
  // Count word frequency
  const wordCounts = words.reduce((acc: {[key: string]: number}, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});
  
  // Convert to array and sort by frequency
  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, 5); // Take top 5 words
  
  // Combine top words into phrases
  const result = [sortedWords[0]];
  
  if (sortedWords.length > 1) {
    result.push(`${sortedWords[0]} ${sortedWords[1]}`);
  }
  
  if (sortedWords.length > 2) {
    result.push(`${sortedWords[0]} ${sortedWords[2]}`);
  }
  
  return result.slice(0, 3); // Return at most 3 terms
}

export async function POST(request: NextRequest) {
  try {
    const { markdownProposal, documentType = "proposal" } = await request.json();

    if (!markdownProposal) {
      return NextResponse.json({ error: 'Missing document text' }, { status: 400 });
    }

    // Create a prompt that asks for search terms
    const prompt = `Based on the following ${documentType === "proposal" ? "research proposal" : "academic paper draft"}, 
    generate 1-3 specific search terms or queries that would be useful for finding related academic papers on Semantic Scholar.
    Focus on the core research topics, methods, or unique aspects that would yield relevant literature.
    Format your response as a JSON array of strings. Example: ["quantum computing ethics", "post-quantum cryptography"]
    
    Here's the document:
    ${markdownProposal.substring(0, 4000)}... [truncated for brevity]`;

    console.log("Sending request to Gemini API for search terms...");
    
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        config: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      });

      console.log("Received search terms from Gemini API.");
      
      // Extract the JSON array from the response
      const responseText = response.text || "[]";
      let searchTerms;
      
      try {
        // Look for array pattern in the response using a more compatible approach
        // Find the first [ and last ] to extract JSON array
        const startIndex = responseText.indexOf('[');
        const endIndex = responseText.lastIndexOf(']');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          const jsonArrayStr = responseText.substring(startIndex, endIndex + 1);
          searchTerms = JSON.parse(jsonArrayStr);
        } else {
          // If no proper array found, try to extract terms another way
          const terms = responseText
            .split(/[\n,]/)
            .map(term => term.trim())
            .filter(term => term && !term.startsWith('[') && !term.startsWith(']') && !term.includes('":['))
            .map(term => term.replace(/^["'\s]+|["'\s]+$/g, ''));
          
          searchTerms = terms.length > 0 ? terms : extractBasicTerms(markdownProposal);
        }
      } catch (parseError) {
        console.error("Failed to parse search terms:", parseError);
        // Fall back to basic term extraction
        searchTerms = extractBasicTerms(markdownProposal);
      }

      return NextResponse.json({
        searchTerms,
        usage: response.usageMetadata || {}
      });
    } catch (apiError) {
      console.error("Error calling Gemini API:", apiError);
      // Fall back to basic term extraction
      const fallbackTerms = extractBasicTerms(markdownProposal);
      return NextResponse.json({
        searchTerms: fallbackTerms,
        error: "Gemini API call failed, using basic term extraction instead"
      });
    }
  } catch (error: any) {
    console.error("General error processing search terms:", error);
    return NextResponse.json({ error: 'Failed to generate search terms.' }, { status: 500 });
  }
} 