# Academic Feedback Assistant

A Next.js web application that provides AI-powered feedback on academic proposals and papers. The tool uses Google's Gemini AI to analyze uploaded PDF documents and generate structured, constructive feedback according to custom assessment guidelines.

## Features

- PDF document upload and OCR text extraction
- Custom assessment guidelines input
- AI-generated structured feedback with:
  - Overall assessment
  - Passage-specific annotations with direct text references
  - Examination areas with categorized assessments
- Interactive UI for navigating between annotations and referenced text
- Dark/light mode support
- Password protection for the application
- Export results as JSON

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [Google Gemini AI](https://ai.google.dev/) - AI model for generating feedback
- [React](https://reactjs.org/) - Frontend library
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework

## Prerequisites

- Node.js 18.17.0 or later
- Google Gemini API key
- Mistral OCR API key (free)

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```
GEMINI_API_KEY=your_gemini_api_key_here
MISTRAL_API_KEY=api_key_here
DEPL_PW=your_password_for_this_app
```

Alternatively, you may want to configure or remove password protection in the `app/components/PasswordProtect.tsx` component.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jonasweinert/academicfeedback.git
   cd academicfeedback
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. Set up environment variables as described above.

4. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to use the application.

## Usage

1. **Upload a PDF document** - Drag and drop or select a PDF file
2. **Enter assessment guidelines** - Input the criteria for evaluating the document
3. **View the feedback** - See AI-generated feedback with:
   - Overall assessment
   - Interactive annotations linked to specific text
   - Detailed evaluation of examination areas

## Deployment

This project can be deployed on Vercel or any platform that supports Next.js applications.

For Vercel deployment:
1. Push your code to a GitHub repository
2. Import the repository in Vercel
3. Configure the environment variables in the Vercel dashboard
4. Deploy

## Notes

- This application is intended for academic use only
- Users are responsible for any content uploaded to the application
- PDF processing may vary in accuracy depending on the document structure and quality

## License

Non-commercial use only. Developed by Jonas W.
