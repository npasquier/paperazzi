'use client';

import { useState } from 'react';
import {
  X,
  Download,
  Github,
  Copy,
  Check,
  ExternalLink,
  FileCode,
  FileText,
} from 'lucide-react';
import { Filters } from '@/types/interfaces';

interface ExportAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: Filters;
  query: string;
}

export default function ExportAlertModal({
  isOpen,
  onClose,
  filters,
  query,
}: ExportAlertModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!isOpen) return null;

  // Build OpenAlex API URL from filters
  const buildOpenAlexUrl = (
    startDate?: string,
    endDate?: string,
    includMailto = false
  ) => {
    const filterParts: string[] = [];

    if (filters.journals.length) {
      filterParts.push(
        `primary_location.source.issn:${filters.journals
          .map((j) => j.issn)
          .join('|')}`
      );
    }

    if (filters.authors.length) {
      filterParts.push(
        `authorships.author.id:${filters.authors
          .map((a) => a.id.replace('https://openalex.org/', ''))
          .join('|')}`
      );
    }

    if (filters.topics.length) {
      filterParts.push(
        `topics.id:${filters.topics
          .map((t) => t.id.replace('https://openalex.org/', ''))
          .join('|')}`
      );
    }

    if (filters.institutions.length) {
      filterParts.push(
        `authorships.institutions.id:${filters.institutions
          .map((i) => i.id.replace('https://openalex.org/', ''))
          .join('|')}`
      );
    }

    if (filters.publicationType) {
      filterParts.push(`type:${filters.publicationType}`);
    }

    if (startDate && endDate) {
      filterParts.push(`publication_date:${startDate}..${endDate}`);
    }

    const params: string[] = [];
    if (filterParts.length) {
      params.push(`filter=${filterParts.join(',')}`);
    }

    if (query) {
      params.push(`search=${encodeURIComponent(query)}`);
    }

    params.push('sort=publication_date:desc');
    params.push('per-page=20');

    if (includMailto) {
      params.push('mailto={MAILTO}');
    }

    return 'https://api.openalex.org/works?' + params.join('&');
  };

  // Python script
  const generatePythonScript = () => {
    return `#!/usr/bin/env python3
"""
Paperazzi Alert Script
Checks for new papers published last month and sends an email via Mailjet.
"""

import os
import requests
from datetime import date, timedelta
from mailjet_rest import Client

# --- Dates ---
today = date.today()
first_of_this_month = today.replace(day=1)
last_month_end = first_of_this_month - timedelta(days=1)
last_month_start = last_month_end.replace(day=1)

START_DATE = last_month_start.isoformat()
END_DATE = last_month_end.isoformat()

# --- Environment variables (set as GitHub secrets) ---
MAILTO = os.environ.get("MAILTO", "")
MAILJET_API_KEY = os.environ.get("MAILJET_API_KEY")
MAILJET_SECRET_KEY = os.environ.get("MAILJET_SECRET_KEY")
TO_EMAIL = os.environ.get("TO_EMAIL")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "alerts@paperazzi.app")

# --- OpenAlex API URL ---
BASE_URL = "${buildOpenAlexUrl('{START_DATE}', '{END_DATE}', false)}"
OPENALEX_URL = BASE_URL.replace("{START_DATE}", START_DATE).replace("{END_DATE}", END_DATE)
if MAILTO:
    OPENALEX_URL += f"&mailto={MAILTO}"

def fetch_papers():
    resp = requests.get(OPENALEX_URL)
    resp.raise_for_status()
    return resp.json().get("results", [])

def format_email(papers):
    if not papers:
        return "No new papers published last month matching your filters."
    
    lines = [f"Found {len(papers)} new paper(s) published last month:\\n"]
    for p in papers:
        title = p.get("title", "No title")
        year = p.get("publication_year", "")
        doi = p.get("doi", "")
        authors = ", ".join([
            a.get("author", {}).get("display_name", "")
            for a in p.get("authorships", [])[:3]
        ])
        if len(p.get("authorships", [])) > 3:
            authors += " et al."
        
        lines.append(f"📄 {title}")
        lines.append(f"   {authors} ({year})")
        if doi:
            lines.append(f"   {doi}")
        lines.append("")
    
    return "\\n".join(lines)

def send_email(content):
    if not MAILJET_API_KEY or not MAILJET_SECRET_KEY or not TO_EMAIL:
        print("⚠️  Missing Mailjet credentials or recipient email.")
        print("   Set MAILJET_API_KEY, MAILJET_SECRET_KEY, TO_EMAIL as GitHub secrets.")
        return
    
    client = Client(auth=(MAILJET_API_KEY, MAILJET_SECRET_KEY), version='v3.1')
    data = {
        'Messages': [{
            "From": {"Email": FROM_EMAIL, "Name": "Paperazzi Alerts"},
            "To": [{"Email": TO_EMAIL}],
            "Subject": f"Paperazzi: New Papers ({START_DATE} to {END_DATE})",
            "TextPart": content
        }]
    }
    result = client.send.create(data=data)
    if result.status_code == 200:
        print("✅ Email sent successfully!")
    else:
        print(f"❌ Failed to send email: {result.status_code}")
        print(result.json())

def main():
    print(f"Checking papers from {START_DATE} to {END_DATE}...")
    papers = fetch_papers()
    content = format_email(papers)
    print(content)
    send_email(content)

if __name__ == "__main__":
    main()
`;
  };

  // GitHub Action workflow
  const generateWorkflow = () => {
    return `name: Check for New Papers

on:
  schedule:
    - cron: '0 9 1 * *'  # 1st of each month at 9am UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install requests mailjet_rest
      
      - name: Check for new papers
        run: python check_papers.py
        env:
          MAILTO: \${{ secrets.MAILTO }}
          MAILJET_API_KEY: \${{ secrets.MAILJET_API_KEY }}
          MAILJET_SECRET_KEY: \${{ secrets.MAILJET_SECRET_KEY }}
          TO_EMAIL: \${{ secrets.TO_EMAIL }}
`;
  };

  // README
  const generateReadme = () => {
    const journalNames = filters.journals
      .map((j) => j.name || j.issn)
      .join(', ');
    const authorNames = filters.authors.map((a) => a.name || a.id).join(', ');
    const topicNames = filters.topics.map((t) => t.display_name).join(', ');
    const instNames = filters.institutions
      .map((i) => i.display_name)
      .join(', ');

    return `# Paperazzi Paper Alert

Automatically checks for new papers published last month and sends an email via Mailjet.

## Your Search Filters

${query ? `- **Query:** ${query}` : ''}
${journalNames ? `- **Journals:** ${journalNames}` : ''}
${authorNames ? `- **Authors:** ${authorNames}` : ''}
${topicNames ? `- **Topics:** ${topicNames}` : ''}
${instNames ? `- **Institutions:** ${instNames}` : ''}
${filters.publicationType ? `- **Type:** ${filters.publicationType}` : ''}

## Setup Instructions

### 1. Repository Setup
- Place \`check_papers.py\` in the repository root
- Place \`check_papers.yml\` in \`.github/workflows/\` folder

### 2. Mailjet Setup (Free tier: 200 emails/day)
1. Create account at [mailjet.com](https://www.mailjet.com/)
2. Get API credentials from API Key Management
3. Verify your sender email address

### 3. GitHub Secrets
Add these secrets in your repo (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| \`MAILTO\` | Your email for OpenAlex API (see note below) |
| \`MAILJET_API_KEY\` | Your Mailjet API key |
| \`MAILJET_SECRET_KEY\` | Your Mailjet secret key |
| \`TO_EMAIL\` | Email address to receive alerts |

#### About MAILTO (Important!)
OpenAlex is a free, open academic database. Adding your email via the \`mailto\` parameter is the **polite way** to use their API:
- Gives you access to the faster "polite pool" (10 requests/second vs 1/second)
- Helps OpenAlex contact you if there's an issue with your queries
- Supports the sustainability of this free service

Learn more: [OpenAlex API Documentation](https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication)

### 4. Enable GitHub Actions
Go to Actions tab and enable workflows for this repository.

## Schedule

Runs automatically on the **1st of each month at 9am UTC**.

You can also trigger manually from the Actions tab → "Check for New Papers" → "Run workflow".

---

Generated by [Paperazzi](https://paperazzi.app)
`;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    downloadFile(generatePythonScript(), 'check_papers.py');
    setTimeout(() => downloadFile(generateWorkflow(), 'check_papers.yml'), 100);
    setTimeout(() => downloadFile(generateReadme(), 'README.md'), 200);
  };

  const files = [
    {
      label: 'check_papers.py',
      filename: 'check_papers.py',
      generator: generatePythonScript,
      id: 'python',
      icon: <FileCode size={14} />,
    },
    {
      label: '.github/workflows/check_papers.yml',
      filename: 'check_papers.yml',
      generator: generateWorkflow,
      id: 'workflow',
      icon: <Github size={14} />,
    },
    {
      label: 'README.md',
      filename: 'README.md',
      generator: generateReadme,
      id: 'readme',
      icon: <FileText size={14} />,
    },
  ];

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div className='absolute inset-0 bg-black/40' onClick={onClose} />
      <div className='relative bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b border-stone-200'>
          <h2 className='text-base font-semibold text-stone-900'>
            Create Paper Alert
          </h2>
          <button
            onClick={onClose}
            className='p-1 hover:bg-stone-100 rounded transition'
          >
            <X size={18} className='text-stone-500' />
          </button>
        </div>

        {/* Content */}
        <div className='p-5 overflow-y-auto max-h-[calc(85vh-130px)] space-y-5'>
          <p className='text-sm text-stone-600'>
            Download these files to set up a GitHub Action that checks for new
            papers monthly and sends you an email.
          </p>

          {/* Setup Steps */}
          <div className='bg-stone-50 rounded-lg p-4'>
            <h3 className='text-sm font-medium text-stone-800 mb-2 flex items-center gap-2'>
              <Github size={16} /> Setup Steps
            </h3>
            <ol className='text-xs text-stone-600 space-y-1.5 list-decimal list-inside'>
              <li>Create a new GitHub repository</li>
              <li>
                Add{' '}
                <code className='bg-stone-200 px-1 rounded'>
                  check_papers.py
                </code>{' '}
                to root
              </li>
              <li>
                Add{' '}
                <code className='bg-stone-200 px-1 rounded'>
                  check_papers.yml
                </code>{' '}
                to{' '}
                <code className='bg-stone-200 px-1 rounded'>
                  .github/workflows/
                </code>
              </li>
              <li>Add GitHub secrets (see README for details)</li>
              <li>Enable Actions in repo settings</li>
            </ol>
          </div>

          {/* Secrets reminder */}
          <div className='bg-blue-50 border border-blue-200 rounded-lg p-3'>
            <p className='text-xs text-blue-800'>
              <strong>Required secrets:</strong>{' '}
              <code className='bg-blue-100 px-1 rounded'>MAILTO</code>,{' '}
              <code className='bg-blue-100 px-1 rounded'>MAILJET_API_KEY</code>,{' '}
              <code className='bg-blue-100 px-1 rounded'>
                MAILJET_SECRET_KEY
              </code>
              , <code className='bg-blue-100 px-1 rounded'>TO_EMAIL</code>
            </p>
          </div>

          {/* Files */}
          {files.map((file) => (
            <div key={file.id} className='border border-stone-200 rounded-lg'>
              <div className='flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-200'>
                <span className='text-xs font-medium text-stone-600 flex items-center gap-1.5'>
                  {file.icon}
                  {file.label}
                </span>
                <div className='flex items-center gap-1'>
                  <button
                    onClick={() => copyToClipboard(file.generator(), file.id)}
                    className='p-1 hover:bg-stone-200 rounded transition'
                    title='Copy to clipboard'
                  >
                    {copied === file.id ? (
                      <Check size={14} className='text-green-600' />
                    ) : (
                      <Copy size={14} className='text-stone-400' />
                    )}
                  </button>
                  <button
                    onClick={() =>
                      downloadFile(file.generator(), file.filename)
                    }
                    className='p-1 hover:bg-stone-200 rounded transition'
                    title='Download file'
                  >
                    <Download size={14} className='text-stone-400' />
                  </button>
                </div>
              </div>
              <pre className='p-3 text-[10px] leading-relaxed overflow-x-auto bg-stone-900 text-stone-300 max-h-32'>
                {file.generator().slice(0, 400)}...
              </pre>
            </div>
          ))}

          {/* API URL Preview */}
          <div className='border border-stone-200 rounded-lg'>
            <div className='flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-200'>
              <span className='text-xs font-medium text-stone-600 flex items-center gap-1.5'>
                <ExternalLink size={14} />
                OpenAlex API URL (preview)
              </span>
              <div className='flex items-center gap-1'>
                <button
                  onClick={() => copyToClipboard(buildOpenAlexUrl(), 'url')}
                  className='p-1 hover:bg-stone-200 rounded transition'
                  title='Copy URL'
                >
                  {copied === 'url' ? (
                    <Check size={14} className='text-green-600' />
                  ) : (
                    <Copy size={14} className='text-stone-400' />
                  )}
                </button>

                <a
                  href={buildOpenAlexUrl()}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='p-1 hover:bg-stone-200 rounded transition'
                  title='Test in browser'
                >
                  <ExternalLink size={14} className='text-stone-400' />
                </a>
              </div>
            </div>
            <pre className='p-3 text-[10px] overflow-x-auto bg-stone-100 text-stone-600 break-all'>
              {buildOpenAlexUrl()}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className='flex items-center justify-between px-5 py-3 border-t border-stone-200 bg-stone-50'>
          <button
            onClick={onClose}
            className='px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 transition'
          >
            Cancel
          </button>
          <button
            onClick={downloadAll}
            className='flex items-center gap-1.5 px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition text-xs font-medium'
          >
            <Download size={14} />
            Download All
          </button>
        </div>
      </div>
    </div>
  );
}
