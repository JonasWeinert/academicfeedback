import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  throw new Error("MISTRAL_API_KEY environment variable is not set.");
}

const client = new Mistral({apiKey});

// Define a simple type for the OCR page response
interface OcrPage {
    index: number;
    markdown: string;
    [key: string]: any;
}

export async function POST(request: NextRequest) {
  try {
    console.log("Starting OCR process...");
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded or invalid file type.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
        return NextResponse.json({ error: 'Invalid file type. Only PDF is allowed.' }, { status: 400 });
    }

    // Convert the file to a Buffer for upload
    const fileContent = Buffer.from(await file.arrayBuffer());
    
    console.log(`Uploading file ${file.name} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB) to Mistral...`);
    
    // Step 1: Upload the file to Mistral
    const uploadedFile = await client.files.upload({
        file: {
            fileName: file.name,
            content: fileContent,
        },
        purpose: "ocr"
    });
    
    console.log("File uploaded, ID:", uploadedFile.id);
    
    // Step 2: Retrieve the file to verify it's available
    const retrievedFile = await client.files.retrieve({
        fileId: uploadedFile.id
    });
    
    console.log("File retrieved:", retrievedFile.id, retrievedFile);
    
    // Step 3: Get a signed URL for the file
    const signedUrl = await client.files.getSignedUrl({
        fileId: uploadedFile.id,
    });
    
    console.log("Got signed URL for file");
    
    // Step 4: Call OCR process using the signed URL
    console.log("Calling Mistral OCR...");
    const ocrResponse = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
            type: "document_url",
            documentUrl: signedUrl.url,
        }
    });
    
    console.log("OCR process completed.");
    
    // Extract and combine the markdown content from all pages
    const markdownContent = ocrResponse.pages.map((page: OcrPage) => page.markdown).join('\n\n---\n\n');
    
    // Optional: Clean up the file after processing
    try {
        await client.files.delete({
            fileId: uploadedFile.id
        });
        console.log("Cleaned up file:", uploadedFile.id);
    } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
        // Don't fail the request if cleanup fails
    }
    
    return NextResponse.json({ markdown: markdownContent });

  } catch (error: any) {
    console.error("OCR API Error:", error);
    let errorMessage = 'Failed to process PDF.';
    if (error.response && error.response.data) {
        errorMessage = error.response.data.message || errorMessage;
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 