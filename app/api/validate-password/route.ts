import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    
    // Compare with environment variable safely on the server
    const isValid = password === process.env.DEPL_PW;
    
    return NextResponse.json({ isValid });
  } catch (error) {
    return NextResponse.json({ isValid: false }, { status: 400 });
  }
} 