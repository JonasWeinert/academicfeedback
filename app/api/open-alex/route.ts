import { NextRequest, NextResponse } from 'next/server';

// OpenAlex API endpoint for works (papers)
const OPENALEX_API = "https://api.openalex.org/works";

interface Paper {
  paperId: string;
  title: string;
  abstract?: string;
  url: string;
  venue?: string;
  year?: number;
  authors: Array<{
    authorId: string;
    name: string;
  }>;
  publicationDate?: string;
  citationCount?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { searchTerms } = await request.json();

    if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
      // Return an empty result instead of an error when no search terms provided
      return NextResponse.json({
        query: "",
        papers: [],
        total: 0
      });
    }

    // Get the primary search term (first one)
    const query = searchTerms[0];
    
    // If the query is empty or too short, return empty result
    if (!query || query.trim().length < 3) {
      return NextResponse.json({
        query: query || "",
        papers: [],
        total: 0
      });
    }
    
    // Calculate date 6 months ago for filtering recent papers
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const fromDate = sixMonthsAgo.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    // Build OpenAlex API URL with parameters
    const params = new URLSearchParams({
      search: query,
      filter: `from_publication_date:${fromDate}`,
      sort: 'relevance_score:desc',
      per_page: '10',  // Request more to filter for best results
    });
    
    const apiUrl = `${OPENALEX_API}?${params.toString()}`;
    
    console.log(`Querying OpenAlex with: ${query}, from date: ${fromDate}`);
    
    // Add your email address in the User-Agent header as recommended by OpenAlex
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'AcademicFeedbackAssistant/1.0 (mailto:support@academicfeedback.app)'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAlex API error (${response.status}): ${errorText}`);
      return NextResponse.json({ error: `OpenAlex API error: ${response.status}` }, { status: 502 });
    }
    
    const data = await response.json();
    
    // Format and filter papers from OpenAlex response
    let papers = (data.results || []).map((paper: any) => ({
      paperId: paper.id || '',
      title: paper.title || 'Untitled Paper',
      abstract: paper.abstract || '',
      url: paper.doi ? `https://doi.org/${paper.doi}` : (paper.open_access?.oa_url || ''),
      venue: paper.primary_location?.source?.display_name || '',
      year: paper.publication_year || null,
      authors: (paper.authorships || []).map((authorship: any) => ({
        authorId: authorship.author?.id || '',
        name: authorship.author?.display_name || 'Unknown Author'
      })),
      publicationDate: paper.publication_date || '',
      citationCount: paper.cited_by_count || 0
    }));
    
    // Filter papers to ensure we have good quality results
    papers = papers
      // Ensure we have a paper with a title and URL
      .filter((paper: Paper) => 
        paper.title && 
        paper.url && 
        (paper.abstract || paper.venue) // Must have either abstract or venue
      )
      // Sort by most cited first, recent date as tiebreaker
      .sort((a: Paper, b: Paper) => {
        const citeDiff = (b.citationCount || 0) - (a.citationCount || 0);
        if (citeDiff !== 0) return citeDiff;
        
        // If citation count is the same, sort by date
        const dateA = a.publicationDate ? new Date(a.publicationDate) : new Date(0);
        const dateB = b.publicationDate ? new Date(b.publicationDate) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      })
      // Take only the top 4
      .slice(0, 4);
    
    return NextResponse.json({
      query,
      papers,
      total: data.meta?.count || 0
    });

  } catch (error: any) {
    console.error("OpenAlex API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch papers from OpenAlex.' }, { status: 500 });
  }
} 