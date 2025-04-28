'use client'; // Required for hooks like useState, useEffect

import { useState, useCallback, ChangeEvent, FormEvent, DragEvent, useRef, useMemo, useEffect } from 'react';
import Image from "next/image"; // Keep if needed, maybe for logo?
import { findBestMatch } from 'string-similarity'; // Import for fuzzy matching

// Define the structure of the feedback object based on the Gemini schema
interface FeedbackPassage {
  referenced_student_text_quote: string;
  feedback: string;
  quote_from_marking_guidelines?: string;
}

interface FeedbackExamination {
  area_of_examination: string;
  assessment_comment: string;
  "suggestion for improvement"?: string; // Make optional as per schema
  assesment_category: "excellent" | "sufficient with room for improvement" | "insufficient";
}

interface FeedbackData {
  overall_feedback: string;
  passages: FeedbackPassage[];
  examination: FeedbackExamination[];
}

interface UsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
}

// Helper function to download JSON
const downloadJson = (data: any, filename: string) => {
    const jsonStr = JSON.stringify(data, null, 2); // Pretty print JSON
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Helper function to normalize text for fuzzy matching
const normalizeText = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    // Replace curly/smart quotes with straight quotes
    .replace(/[\u2018\u2019]/g, "'") // Replace single curly quotes
    .replace(/[\u201C\u201D]/g, '"') // Replace double curly quotes
    // Normalize other potential special characters
    .replace(/\u2013|\u2014/g, '-') // Replace em/en dashes with hyphens
    .replace(/\u2026/g, '...') // Replace ellipsis character
    // Consistent whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

export default function Home() {
  const [step, setStep] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [markdownProposal, setMarkdownProposal] = useState<string>('');
  const [assessmentGuidelines, setAssessmentGuidelines] = useState<string>('');
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [tokenUsage, setTokenUsage] = useState<UsageMetadata | null>(null); // State for token usage
  const [isLoadingOcr, setIsLoadingOcr] = useState<boolean>(false); // Specific loading state for OCR
  const [isLoadingFeedback, setIsLoadingFeedback] = useState<boolean>(false); // Specific loading state for Feedback
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false); // State for drag-and-drop UI
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null); // For highlighting interaction

  // Refs for scrolling
  const feedbackRef = useRef<HTMLDivElement>(null);
  const proposalTextRef = useRef<HTMLDivElement>(null);
  const annotationsSidebarRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (selectedFile: File | null) => {
    setError(null);
    if (selectedFile) {
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
      } else {
        setError('Please upload a PDF file.');
        setFile(null);
      }
    } else {
      setFile(null);
    }
  };

  // Drag and Drop Handlers
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if not dragging over a child element
    if (e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow drop
    e.stopPropagation();
    setIsDragging(true); // Keep highlighting while dragging over
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
      // Maybe clear the input field if one exists
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      e.dataTransfer.clearData();
    }
  };

  // OCR Handler
  const handleUploadAndOCR = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!file) {
      setError('Please select or drop a PDF file first.');
      return;
    }

    setIsLoadingOcr(true); // Use specific loader
    setError(null);
    setMarkdownProposal('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      setMarkdownProposal(result.markdown);
      setStep(2);
    } catch (err: any) {
      console.error('OCR Error:', err);
      setError(`Failed to process PDF: ${err.message}`);
      setMarkdownProposal('');
    } finally {
      setIsLoadingOcr(false); // Turn off specific loader
    }
  };

  const handleGuidelinesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setAssessmentGuidelines(event.target.value);
  };

  // Updated Feedback Handler
  const handleGetFeedback = async (event: FormEvent) => {
    event.preventDefault();
    if (!markdownProposal) {
      setError('Proposal text is missing. Please go back to step 1.');
      return;
    }
    if (!assessmentGuidelines.trim()) {
      setError('Please enter assessment guidelines.');
      return;
    }

    setIsLoadingFeedback(true); // Use specific loader
    setError(null);
    setFeedback(null);
    setTokenUsage(null); // Clear previous usage

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markdownProposal, assessmentGuidelines }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      setFeedback(result.feedback as FeedbackData); // Extract feedback
      setTokenUsage(result.usage as UsageMetadata); // Extract usage data
      setStep(3);
      setTimeout(() => {
          feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

    } catch (err: any) {
      console.error('Feedback Error:', err);
      setError(`Failed to get feedback: ${err.message}`);
      setFeedback(null);
      setTokenUsage(null);
    } finally {
      setIsLoadingFeedback(false); // Turn off specific loader
    }
  };

  // Memoize the processed proposal text and annotations to avoid re-computation
  const { annotatedProposalHtml, annotationData } = useMemo(() => {
    if (!markdownProposal || !feedback?.passages || feedback.passages.length === 0) {
      return { annotatedProposalHtml: <pre className="whitespace-pre-wrap break-words">{markdownProposal || ''}</pre>, annotationData: [] };
    }

    // Store original content
    const originalHtml = markdownProposal;

    // Track which passages we've matched successfully and their positions
    const matchedPassages = new Map<string, { passage: FeedbackPassage, id: string, startIndex: number }>();
    const appliedAnnotations = new Set<string>();

    // Create a mapping for annotation IDs
    const passageMap = new Map<string, {
      passage: FeedbackPassage,
      id: string
    }>();

    // Prepare passages for advanced matching
    feedback.passages.forEach((passage, index) => {
      const id = `annotation-${index}`;
      passageMap.set(passage.referenced_student_text_quote, {
        passage,
        id
      });
    });

    // Function to find the best substring match
    function findBestSubstringMatch(needle: string, haystack: string): {
      startIndex: number,
      endIndex: number,
      matchedText: string,
      similarity: number
    } | null {
      // Skip very short quotes as they might lead to false matches
      if (needle.length < 10) return null;

      // For very long quotes, use a sliding window approach
      const needleNormalized = normalizeText(needle);
      const haystackNormalized = normalizeText(haystack);

      // For quotes longer than 50 chars, try matching key parts
      if (needleNormalized.length > 50) {
        // Extract a few distinctive chunks (beginning, middle, end)
        const chunks = [
          needleNormalized.substring(0, 30),
          needleNormalized.substring(Math.floor(needleNormalized.length / 2) - 15, Math.floor(needleNormalized.length / 2) + 15),
          needleNormalized.substring(needleNormalized.length - 30)
        ];

        // Find locations of these chunks in the haystack
        const locations = chunks
          .map(chunk => {
            const idx = haystackNormalized.indexOf(chunk);
            return idx >= 0 ? { chunk, idx } : null;
          })
          .filter(Boolean);

        // If we found at least one chunk
        if (locations.length > 0) {
          // Sort by index to find the earliest one
          locations.sort((a, b) => a!.idx - b!.idx);
          const firstChunk = locations[0]!;

          // Estimate the start index based on which chunk we matched
          let estimatedStartIndex;
          if (firstChunk.chunk === chunks[0]) {
            estimatedStartIndex = firstChunk.idx;
          } else if (firstChunk.chunk === chunks[1]) {
            estimatedStartIndex = Math.max(0, firstChunk.idx - Math.floor(needleNormalized.length / 2) + 15);
          } else {
            estimatedStartIndex = Math.max(0, firstChunk.idx - needleNormalized.length + 30);
          }

          // Extract the region around this chunk from the original text
          const estimatedEndIndex = Math.min(haystack.length, estimatedStartIndex + needle.length + 20);

          // Get the actual text from the original
          const matchedText = haystack.substring(estimatedStartIndex, estimatedEndIndex);

          // Calculate approximate similarity
          const matchSimilarity = 0.9; // High confidence if we matched a chunk exactly

          return {
            startIndex: estimatedStartIndex,
            endIndex: estimatedEndIndex,
            matchedText,
            similarity: matchSimilarity
          };
        }
      }

      // For shorter quotes or if chunk matching fails, use a different approach
      // Try to find a match with a decent sequence of words
      const words = needle.split(/\s+/).filter(w => w.length > 3);

      if (words.length >= 3) {
        // Find a sequence of 3+ consequent words that match
        for (let i = 0; i <= words.length - 3; i++) {
          // Escape each word to avoid regex syntax errors from special characters
          const escapedWords = words.slice(i, i + 3).map(word =>
            word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          );

          // Join with escaped whitespace pattern
          const wordSeq = escapedWords.join("\\s+");

          try {
            // Safely create regex with error handling
            const seqRegex = new RegExp(wordSeq, "i");
            const match = haystackNormalized.match(seqRegex);

            if (match && match.index !== undefined) {
              // Expand to get the full approximate quote
              const startIdx = Math.max(0, match.index - 20);
              const endIdx = Math.min(haystackNormalized.length, match.index + needle.length + 20);

              // Get the matched text from the original
              const matchedText = haystack.substring(startIdx, endIdx);

              return {
                startIndex: startIdx,
                endIndex: endIdx,
                matchedText,
                similarity: 0.85 // Good confidence for 3+ word sequence match
              };
            }
          } catch (error) {
            console.error(`RegExp error with: "${wordSeq}"`, error);
            // Continue to next word sequence if this one has regex issues
            continue;
          }
        }
      }

      // Last resort: find ANY significant word from the quote
      const significantWords = words.filter(w => w.length > 5).sort((a, b) => b.length - a.length);

      if (significantWords.length > 0) {
        for (const word of significantWords) {
          // Escape the word to prevent regex errors
          const escapedWord = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          try {
            const idx = haystackNormalized.indexOf(escapedWord);

            if (idx >= 0) {
              const startIdx = Math.max(0, idx - 10);
              const endIdx = Math.min(haystackNormalized.length, idx + needle.length + 10);

              const matchedText = haystack.substring(startIdx, endIdx);

              return {
                startIndex: startIdx,
                endIndex: endIdx,
                matchedText,
                similarity: 0.7 // Lower confidence for single word match
              };
            }
          } catch (error) {
            console.error(`Error matching word: "${escapedWord}"`, error);
            continue;
          }
        }
      }

      return null; // No match found
    }

    // Apply highlighting to the text
    let finalHtml = originalHtml;
    let processedHtml = finalHtml;
    let offset = 0; // Track offset changes due to HTML insertion

    // Process passages to annotate. Start with longer ones first.
    const sortedPassages = [...feedback.passages]
      .sort((a, b) => b.referenced_student_text_quote.length - a.referenced_student_text_quote.length);

    for (const passage of sortedPassages) {
      const quote = passage.referenced_student_text_quote;
      const info = passageMap.get(quote);

      if (!info) continue; // Skip if we can't find the info/id

      // Use the *current* state of processedHtml for matching
      const match = findBestSubstringMatch(quote, processedHtml);

      if (match && match.similarity >= 0.7) { // Require reasonable confidence
        // Debug
        console.log(`Found match for: "${quote.substring(0, 30)}..." with similarity ${match.similarity}`);

        // Get the text we're going to wrap from the current processedHtml
        const textToWrap = processedHtml.substring(match.startIndex, match.endIndex);
        const startIdx = match.startIndex;
        const endIdx = match.endIndex; // Use the matched end index

        // Insert the highlighting span
        const before = processedHtml.substring(0, startIdx);
        const after = processedHtml.substring(endIdx);

        const highlightedText = `<span id="text-${info.id}" data-annotation-id="${info.id}" class="annotation-highlight cursor-pointer transition-colors duration-200 ${activeAnnotationId === info.id ? 'bg-yellow-200 dark:bg-yellow-700/50' : 'bg-blue-100/50 dark:bg-blue-900/30 hover:bg-blue-200/70 dark:hover:bg-blue-800/50'} rounded px-1">${textToWrap}</span>`;

        processedHtml = before + highlightedText + after;

        // Store the match info including the start index relative to the *original* text (adjusting for offset changes isn't strictly necessary for sorting if we match on original)
        // Let's try matching on the original text to get stable indices for sorting
        const originalMatch = findBestSubstringMatch(quote, originalHtml);
        const stableStartIndex = originalMatch ? originalMatch.startIndex : -1; // Fallback if original match fails

        matchedPassages.set(quote, { passage, id: info.id, startIndex: stableStartIndex });
        appliedAnnotations.add(info.id);

        // Update offset based on the length difference introduced by the span
        // offset += highlightedText.length - textToWrap.length; // This becomes complex if matches overlap. Simpler to re-match on original for sorting index.
      }
    }

    // Render the HTML with highlights
    const renderedHtml = (
      <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap break-words">
        <div dangerouslySetInnerHTML={{ __html: processedHtml.replace(/\n/g, '<br />') }} />
      </div>
    );

    // Prepare sidebar data
    const matchedAnnotationsData = Array.from(matchedPassages.values()).map(info => ({
      id: info.id,
      feedback: info.passage.feedback,
      guideline: info.passage.quote_from_marking_guidelines,
      quote: info.passage.referenced_student_text_quote,
      startIndex: info.startIndex // Keep track of position
    }));

    // Get unmatched annotations - assign a high start index so they appear last if sorted
    const unmatchedAnnotationsData = feedback.passages
      .filter(p => !matchedPassages.has(p.referenced_student_text_quote))
      .map((p, index) => ({
        id: `unmatched-${index}`,
        feedback: p.feedback,
        guideline: p.quote_from_marking_guidelines,
        quote: p.referenced_student_text_quote,
        startIndex: Infinity // Place unmatched annotations at the end
      }));

    // Combine and sort annotations by their starting position in the original text
    const allAnnotations = [...matchedAnnotationsData, ...unmatchedAnnotationsData]
        .sort((a, b) => a.startIndex - b.startIndex);


    console.log(`Matched ${matchedAnnotationsData.length} quotes, ${unmatchedAnnotationsData.length} unmatched`);

    return {
      annotatedProposalHtml: renderedHtml,
      annotationData: allAnnotations // Use the sorted array
    };
  }, [markdownProposal, feedback, activeAnnotationId]);

  // Interaction handler for annotations
  const handleAnnotationInteraction = (annotationId: string | null) => {
    setActiveAnnotationId(annotationId);

    if (annotationId) {
      // Scroll sidebar to the comment
      const commentElement = document.getElementById(`comment-${annotationId}`);
      commentElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      commentElement?.classList.add('ring-2', 'ring-blue-500'); // Add visual cue

      // Scroll main text to the highlight
      const textElement = document.getElementById(`text-${annotationId}`);
      textElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Remove ring after a short delay
        setTimeout(() => {
           commentElement?.classList.remove('ring-2', 'ring-blue-500');
        }, 1500); // Adjust timing as needed
    }
  };

  // Add click listener to the proposal text area
  useEffect(() => {
    const proposalDiv = proposalTextRef.current;
    if (!proposalDiv) return;

    const handleClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const annotationSpan = target.closest<HTMLElement>('.annotation-highlight');
        if (annotationSpan) {
            const id = annotationSpan.dataset.annotationId;
            if (id) {
                handleAnnotationInteraction(id);
            }
        } else {
             // Clicked outside highlighted text, maybe deactivate?
             // setActiveAnnotationId(null); // Optional: deselect on click outside
        }
    };

    proposalDiv.addEventListener('click', handleClick);
    return () => {
      proposalDiv.removeEventListener('click', handleClick);
    };
  }, [annotatedProposalHtml]); // Re-attach listener if HTML changes

  const getAssessmentColor = (category: string): string => {
    switch (category) {
      case 'excellent': return 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300';
      case 'sufficient with room for improvement': return 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300';
      case 'insufficient': return 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300';
      default: return 'bg-gray-100 border-gray-300 text-gray-800 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-[family-name:var(--font-geist-sans)]">
      <nav className="bg-white dark:bg-gray-800 shadow-sm p-4 sticky top-0 z-20">
        <h1 className="text-xl font-bold text-center">Academic Feedback Assistant</h1>
      </nav>

      {/* Use more screen width */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8">
        {/* Progress Indicator */}
        <div className="mb-8">
          <ol className="flex items-center w-full text-sm font-medium text-center text-gray-500 dark:text-gray-400 sm:text-base">
            <li className={`flex md:w-full items-center ${step >= 1 ? 'text-blue-600 dark:text-blue-500' : ''} sm:after:content-[''] after:w-full after:h-1 after:border-b after:border-gray-200 after:border-1 after:hidden sm:after:inline-block after:mx-6 xl:after:mx-10 dark:after:border-gray-700`}>
              <span className="flex items-center after:content-['/'] sm:after:hidden after:mx-2 after:text-gray-200 dark:after:text-gray-500">
                {step > 1 ? (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 me-2.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z"/></svg>
                ) : (
                  <span className={`me-2 ${step === 1 ? 'border border-blue-600 rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>{step === 1 ? '1' : ''}</span>
                )}
                 Upload <span className="hidden sm:inline-flex sm:ms-2">Proposal</span>
              </span>
            </li>
            <li className={`flex md:w-full items-center ${step >= 2 ? 'text-blue-600 dark:text-blue-500' : ''} after:content-[''] after:w-full after:h-1 after:border-b after:border-gray-200 after:border-1 after:hidden sm:after:inline-block after:mx-6 xl:after:mx-10 dark:after:border-gray-700`}>
               <span className="flex items-center after:content-['/'] sm:after:hidden after:mx-2 after:text-gray-200 dark:after:text-gray-500">
                {step > 2 ? (
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 me-2.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z"/></svg>
                ) : (
                    <span className={`me-2 ${step === 2 ? 'border border-blue-600 rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>{step === 2 ? '2' : ''}</span>
                )}
                Set <span className="hidden sm:inline-flex sm:ms-2">Guidelines</span>
               </span>
            </li>
            <li className={`flex items-center ${step === 3 ? 'text-blue-600 dark:text-blue-500' : ''}`}>
             <span className={`me-2 ${step === 3 ? 'border border-blue-600 rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>{step === 3 ? '3' : ''}</span>
              View <span className="hidden sm:inline-flex sm:ms-2">Feedback</span>
            </li>
          </ol>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 text-sm text-red-800 rounded-lg bg-red-100 dark:bg-red-900 dark:text-red-300 border border-red-300 dark:border-red-600" role="alert">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        {/* Step 1: Upload PDF with Drag and Drop */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Step 1: Upload Your Proposal (PDF)</h2>
            <form onSubmit={handleUploadAndOCR}>
               {/* Sexy Upload Zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-64 border-2 ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'} border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200 relative`}
               >
                <input
                    id="file-upload"
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept="application/pdf"
                    onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
                 />
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4 pointer-events-none">
                   <svg className={`w-10 h-10 mb-4 ${isDragging ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg>
                   <p className={`mb-2 text-sm ${isDragging ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                     <span className="font-semibold">Click to upload</span> or drag and drop
                   </p>
                   <p className="text-xs text-gray-500 dark:text-gray-400">PDF only (MAX 50MB)</p>
                   {file && <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">Selected: {file.name}</p>}
                 </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">Drop a PDF file or click the area above to select one.</p>

              <button
                type="submit"
                disabled={!file || isLoadingOcr}
                className="mt-6 w-full sm:w-auto text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoadingOcr ? (
                  <>
                    <svg aria-hidden="true" role="status" className="inline w-4 h-4 me-3 text-white animate-spin" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="#E5E7EB"/><path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor"/></svg>
                    Processing PDF...
                  </>
                ) : (
                  'Upload & Process PDF'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Enter Guidelines */}
        {step === 2 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Step 2: Define Assessment Guidelines</h2>
            <form onSubmit={handleGetFeedback}>
              <div className="mb-4">
                <label htmlFor="assessment-guidelines" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Assessment Guidelines</label>
                <textarea
                  id="assessment-guidelines"
                  rows={10}
                  value={assessmentGuidelines}
                  onChange={(e) => setAssessmentGuidelines(e.target.value)}
                  className="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 font-[family-name:var(--font-geist-mono)]"
                  placeholder="Enter the guidelines the AI should use for marking the proposal..."
                  required
                ></textarea>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                 <button
                    type="button"
                    onClick={() => { setStep(1); setError(null); setFile(null); setMarkdownProposal(''); }}
                    className="w-full sm:w-auto text-gray-900 bg-white border border-gray-300 hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:border-gray-600 dark:focus:ring-gray-700"
                 >
                    Back to Upload
                 </button>
                <button
                  type="submit"
                  disabled={isLoadingFeedback || !assessmentGuidelines.trim()}
                  className="w-full sm:w-auto text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoadingFeedback ? (
                    <>
                      <svg aria-hidden="true" role="status" className="inline w-4 h-4 me-3 text-white animate-spin" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="#E5E7EB"/><path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor"/></svg>
                      Generating Feedback...
                    </>
                   ) : 'Get Feedback'}
                </button>
              </div>
               <details className="mt-6">
                  <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:underline">Show Extracted Proposal Text (Markdown)</summary>
                  <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto max-h-60 whitespace-pre-wrap break-words font-[family-name:var(--font-geist-mono)]">
                    {markdownProposal || "No proposal text extracted yet."}
                  </pre>
               </details>
            </form>
          </div>
        )}

        {/* Step 3: Display Feedback */}
        {step === 3 && feedback && (
          <div ref={feedbackRef} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow space-y-6 scroll-mt-20">
            <div className="flex justify-between items-center mb-4">
                 <h2 className="text-lg font-semibold">Step 3: Feedback Results</h2>
                 {/* Export Button */}
                 <button
                    onClick={() => downloadJson({ feedback, tokenUsage }, 'feedback_response.json')}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                 >
                     <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                     Export Raw Response (JSON)
                 </button>
            </div>

            {/* Token Usage */}
            {tokenUsage && (
                <div className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg p-2 flex gap-4">
                    <span>Input Tokens: {tokenUsage.promptTokenCount ?? 'N/A'}</span>
                    <span>Output Tokens: {tokenUsage.candidatesTokenCount ?? 'N/A'}</span>
                    <span>Total Tokens: {tokenUsage.totalTokenCount ?? 'N/A'}</span>
                </div>
            )}

            {/* Overall Feedback */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2 text-base">Overall Feedback</h3>
              <p className="text-sm whitespace-pre-wrap">{feedback.overall_feedback}</p>
            </div>

             {/* Examination Areas */}
             <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
               <h3 className="font-semibold mb-3 text-base">Examination Areas</h3>
               <div className="space-y-2">
                 {feedback.examination.map((item, index) => (
                   <details key={index} className="border border-gray-200 dark:border-gray-600 rounded group" open={index < 1}>
                     <summary className={`p-3 cursor-pointer list-none flex justify-between items-center rounded-t ${getAssessmentColor(item.assesment_category)} hover:brightness-95 dark:hover:brightness-110 transition-all`}>
                       <h4 className="font-semibold text-sm">
                            {item.area_of_examination}
                            <span className={`ml-2 inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${getAssessmentColor(item.assesment_category)}`}>
                                {item.assesment_category}
                            </span>
                        </h4>
                         <span className="text-xs group-open:rotate-90 transform transition-transform duration-200">▶</span>
                     </summary>
                     <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-b">
                         <p className="text-xs mb-1"><strong>Comment:</strong> {item.assessment_comment}</p>
                         {item["suggestion for improvement"] && (
                           <p className="text-xs"><strong>Suggestion:</strong> {item["suggestion for improvement"]}</p>
                         )}
                     </div>
                   </details>
                 ))}
               </div>
             </div>

            {/* Annotated Proposal - Sidebar Layout */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-3 text-base">Annotated Proposal & Feedback</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">Click on highlighted text or comments below to jump between them.</p>
              <div className="flex flex-col md:flex-row gap-6">
                {/* Proposal Text */}
                <div ref={proposalTextRef} className="w-full md:w-2/3 lg:w-3/4 flex-shrink-0 border border-gray-200 dark:border-gray-700 rounded p-3 max-h-[70vh] overflow-y-auto">
                   {annotatedProposalHtml}
                </div>
                {/* Annotations Sidebar */}
                <div ref={annotationsSidebarRef} className="w-full md:w-1/3 lg:w-1/4 flex-shrink-0 space-y-3 max-h-[70vh] overflow-y-auto">
                  <h4 className="text-sm font-semibold sticky top-0 bg-gray-100 dark:bg-gray-700 p-2 rounded -mx-2 z-10">Comments</h4>
                  {annotationData.length === 0 && <p className="text-xs text-gray-500 italic px-2">No annotations found or generated.</p>}
                  {annotationData.map((anno) => (
                    <div
                      key={anno.id}
                      id={`comment-${anno.id}`}
                      onClick={() => handleAnnotationInteraction(anno.id.startsWith('unmatched-') ? null : anno.id)}
                      onMouseEnter={() => !anno.id.startsWith('unmatched-') && setActiveAnnotationId(anno.id)}
                      onMouseLeave={() => setActiveAnnotationId(null)}
                      className={`p-2 border rounded text-xs cursor-pointer transition-all duration-200 ${activeAnnotationId === anno.id ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/40' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600/50'} ${anno.id.startsWith('unmatched-') ? 'border-dashed border-orange-400 dark:border-orange-600' : ''}`}
                    >
                        {anno.id.startsWith('unmatched-') && (
                            <p className="mb-1 font-medium text-orange-600 dark:text-orange-400">Unmatched Quote:</p>
                        )}
                        {anno.id.startsWith('unmatched-') && (
                          <p className="mb-1 break-words italic text-gray-500 dark:text-gray-400">"{anno.quote}"</p>
                        )}
                      <p className="font-semibold">Feedback:</p>
                      <p className="mb-1">{anno.feedback}</p>
                      {anno.guideline && (
                        <p className="text-gray-500 dark:text-gray-400 mt-1 pt-1 border-t border-gray-200 dark:border-gray-600">
                            <em>Guideline: {anno.guideline}</em>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-6">
                 <button
                    type="button"
                    onClick={() => { setStep(1); setError(null); setFile(null); setMarkdownProposal(''); setAssessmentGuidelines(''); setFeedback(null); setTokenUsage(null); }}
                    className="text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
                >
                    Start New Feedback
                </button>
            </div>

             {/* Raw Feedback Data (for debugging/verification) */}
             <details className="mt-6">
                  <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:underline">Show Raw Feedback JSON</summary>
                  <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap break-words font-[family-name:var(--font-geist-mono)]">
                    {JSON.stringify({ feedback, tokenUsage }, null, 2)}
                  </pre>
               </details>
          </div>
        )}

      </main>
        <footer className="text-center p-4 mt-8 text-xs text-gray-500 dark:text-gray-400">
             Developed by Jonas W for non-commercial use only. User is responsile for any content uploaded.
        </footer>
    </div>
  );
}
