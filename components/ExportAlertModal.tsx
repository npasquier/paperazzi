'use client';

import { useState } from 'react';
import { X, Download, Github, Copy, Check, ExternalLink, Mail } from 'lucide-react';
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
  const buildOpenAlexUrl = (startDate?: string, endDate?: string) => {
    const filterParts: string[] = [];

    if (filters.journals.length) {
      filterParts.push(
        `primary_location.source.issn:${filters.journals.map(j => j.issn).join('|')}`
      );
    }

    if (filters.authors.length) {
      filterParts.push(
        `authorships.author.id:${filters.authors.map(a => a.id.replace('https://openalex.org/', '')).join('|')}`
      );
    }

    if (filters.topics.length) {
      filterParts.push(
        `topics.id:${filters.topics.map(t => t.id.replace('https://openalex.org/', '')).join('|')}`
      );
    }

    if (filters.institutions.length) {
      filterParts.push(
        `authorships.institutions.id:${filters.institutions.map(i => i.id.replace('https://openalex.org/', '')).join('|')}`
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

    return 'https://api.openalex.org/works?' + params.join('&');
  };

  // Python script using last month filter and Mailjet
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

# --- OpenAlex API URL ---
OPENALEX_URL = "${buildOpenAlexUrl('{START_DATE}', '{END_DATE}')}".replace("{START_DATE}", START_DATE).replace("{END_DATE}", END_DATE)

# --- Mailjet credentials ---
MAILJET_API_KEY = os.environ.get("MAILJET_API_KEY")
MAILJET_SECRET_KEY = os.environ.get("MAILJET_SECRET_KEY")
TO_EMAIL = os.environ.get("TO_EMAIL")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "alerts@paperazzi.app")

def fetch_papers():
    resp = requests.get(OPENALEX_URL)
    resp.raise_for_status()
    return resp.json().get("results", [])

def format_email(papers):
    if not papers:
        return "No new papers published last month."
    lines = []
    for p in papers:
        title = p.get("title", "No title")
        year = p.get("publication_year", "")
        authors = ", ".join([
            a.get("author", {}).get("display_name", "")
            for a in p.get("authorships", [])[:3]
        ])
        lines.append(f"📄 {title}\\n   {authors} ({year})\\n")
    return "\\n".join(lines)

def send_email(content):
    if not MAILJET_API_KEY or not MAILJET_SECRET_KEY or not TO_EMAIL:
        print("Missing Mailjet credentials or recipient email. Set MAILJET_API_KEY, MAILJET_SECRET_KEY, TO_EMAIL.")
        return
    client = Client(auth=(MAILJET_API_KEY, MAILJET_SECRET_KEY), version='v3.1')
    data = {
        'Messages': [{
            "From": {"Email": FROM_EMAIL, "Name": "Paperazzi Alerts"},
            "To": [{"Email": TO_EMAIL}],
            "Subject": "Paperazzi: New Papers Last Month",
            "TextPart": content
        }]
    }
    result = client.send.create(data=data)
    print(result.status_code, result.json())

def main():
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
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install requests mailjet_rest
      - run: python check_papers.py
        env:
          MAILJET_API_KEY: \${{ secrets.MAILJET_API_KEY }}
          MAILJET_SECRET_KEY: \${{ secrets.MAILJET_SECRET_KEY }}
          TO_EMAIL: \${{ secrets.TO_EMAIL }}
`;
  };

  // README
  const generateReadme = () => {
    const journalNames = filters.journals.map(j => j.name || j.issn).join(', ');
    const authorNames = filters.authors.map(a => a.name || a.id).join(', ');
    const topicNames = filters.topics.map(t => t.display_name).join(', ');
    const instNames = filters.institutions.map(i => i.display_name).join(', ');

    return `# Paperazzi Paper Alert

Automatically checks for new papers published last month and sends an email via Mailjet.

## Your Search

${query ? `**Query:** ${query}` : ''}
${journalNames ? `**Journals:** ${journalNames}` : ''}
${authorNames ? `**Authors:** ${authorNames}` : ''}
${topicNames ? `**Topics:** ${topicNames}` : ''}
${instNames ? `**Institutions:** ${instNames}` : ''}
${filters.publicationType ? `**Type:** ${filters.publicationType}` : ''}
${
  filters.dateFrom || filters.dateTo
    ? `**Years:** ${filters.dateFrom || 'Any'} - ${filters.dateTo || 'Any'}`
    : ''
}

## Setup

1. Place \`check_papers.py\` in repo root
2. Place \`check_papers.yml\` in \`.github/workflows/\`
3. Add secrets \`MAILJET_API_KEY\`, \`MAILJET_SECRET_KEY\`, and \`TO_EMAIL\` in GitHub
4. Enable Actions in repo settings

Runs monthly on the 1st at 9am UTC.

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
            papers monthly and sends an email via Mailjet.
          </p>

          {/* Setup Steps */}
          <div className='bg-stone-50 rounded-lg p-4'>
            <h3 className='text-sm font-medium text-stone-800 mb-2 flex items-center gap-2'>
              <Github size={16} /> Setup Steps
            </h3>
            <ol className='text-xs text-stone-600 space-y-1.5 list-decimal list-inside'>
              <li>Create a new GitHub repository</li>
              <li>Add <code className='bg-stone-200 px-1 rounded'>check_papers.py</code> to root</li>
              <li>Add <code className='bg-stone-200 px-1 rounded'>check_papers.yml</code> to <code className='bg-stone-200 px-1 rounded'>.github/workflows/</code></li>
              <li>Add GitHub secrets: <code>MAILJET_API_KEY</code>, <code>MAILJET_SECRET_KEY</code>, <code>TO_EMAIL</code></li>
              <li>Enable Actions in repo settings</li>
            </ol>
          </div>

          {/* Files */}
          {[
            { label: 'check_papers.py', generator: generatePythonScript, id: 'python', icon: <Mail size={14} /> },
            { label: '.github/workflows/check_papers.yml', generator: generateWorkflow, id: 'workflow', icon: <Github size={14} /> },
            { label: 'README.md', generator: generateReadme, id: 'readme', icon: <ExternalLink size={14} /> },
          ].map(file => (
            <div key={file.id} className='border border-stone-200 rounded-lg'>
              <div className='flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-200'>
                <span className='text-xs font-medium text-stone-600 flex items-center gap-1'>{file.icon}{file.label}</span>
                <div className='flex items-center gap-1'>
                  <button
                    onClick={() => copyToClipboard(file.generator(), file.id)}
                    className='p-1 hover:bg-stone-200 rounded transition'
                  >
                    {copied === file.id ? (
                      <Check size={14} className='text-green-600' />
                    ) : (
                      <Copy size={14} className='text-stone-400' />
                    )}
                  </button>
                  <button
                    onClick={() => downloadFile(file.generator(), file.label)}
                    className='p-1 hover:bg-stone-200 rounded transition'
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
