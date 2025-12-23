'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import parsePapers from '../../../utils/parsePapers';
import buildAbstract from '../../../utils/abstract';
import { Paper } from '../../types/interfaces';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PaperPage() {
  const params = useParams();
  const paperId = params.id as string;

  const [paper, setPaper] = useState<Paper | null>(null);

  const [related, setRelated] = useState<Paper[]>([]);
  const [relatedPage, setRelatedPage] = useState(1);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const [cited, setCited] = useState<Paper[]>([]);
  const [citedPage, setCitedPage] = useState(1);
  const [loadingCited, setLoadingCited] = useState(false);

  const [cites, setCites] = useState<Paper[]>([]);
  const [citesPage, setCitesPage] = useState(1);
  const [loadingCites, setLoadingCites] = useState(false);
  const [referencedWorks, setReferencedWorks] = useState<string[]>([]);

  const [loadingPaper, setLoadingPaper] = useState(true);

  // Fetch main paper
  useEffect(() => {
    if (!paperId) return;

    const fetchPaper = async () => {
      setLoadingPaper(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works/${paperId}`
        );
        const [p] = parsePapers([res.data]);
        setPaper(p);

        // store references
        if (res.data.referenced_works?.length) {
          setReferencedWorks(res.data.referenced_works);
          fetchCites(1, res.data.referenced_works);
        }

        // reset related and cited
        setRelated([]);
        setRelatedPage(1);
        setCited([]);
        setCitedPage(1);
      } finally {
        setLoadingPaper(false);
      }
    };

    fetchPaper();
  }, [paperId]);

  // Fetch related papers
  useEffect(() => {
    if (!paperId) return;

    const fetchRelated = async () => {
      setLoadingRelated(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works?filter=related_to:${paperId}&per-page=3&page=${relatedPage}`
        );
        setRelated((prev) => [...prev, ...parsePapers(res.data.results)]);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelated();
  }, [paperId, relatedPage]);

  // Fetch cited papers
  useEffect(() => {
    if (!paperId) return;

    const fetchCited = async () => {
      setLoadingCited(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works?filter=cites:${paperId}&per-page=3&page=${citedPage}`
        );
        setCited((prev) => [...prev, ...parsePapers(res.data.results)]);
      } finally {
        setLoadingCited(false);
      }
    };

    fetchCited();
  }, [paperId, citedPage]);

  const fetchCites = async (pageToLoad: number) => {
    if (!referencedWorks || referencedWorks.length === 0) return;

    setLoadingCites(true);
    try {
      const batch = referencedWorks.slice((pageToLoad - 1) * 3, pageToLoad * 3);
      if (batch.length === 0) return;

      const papers: Paper[] = [];

      for (const url of batch) {
        const id = url.split('/').pop();
        if (!id) continue;

        try {
          const res = await axios.get(`https://api.openalex.org/works/${id}`);
          const [p] = parsePapers([res.data]);
          papers.push(p);
        } catch (err) {
          // skip missing papers
          console.warn(`Paper ${id} not found, skipping`);
        }
      }

      setCites((prev) => [...prev, ...papers]);
    } finally {
      setLoadingCites(false);
    }
  };

  // When main paper loads, initialize page 1
  useEffect(() => {
    if (!referencedWorks || referencedWorks.length === 0) return;
    setCites([]); // reset previous references
    setCitesPage(1);
    fetchCites(1);
  }, [referencedWorks]);

  if (loadingPaper || !paper) return <div>Loading paper…</div>;

  return (
    <div className='max-w-4xl mx-auto py-6 space-y-6'>
      {/* MAIN PAPER */}
      <div>
        <h1 className='text-2xl font-bold'>{paper.title}</h1>
        <div className='text-sm'>{paper.authors.join(', ')}</div>
        <div className='text-sm'>
          {paper.journal_name} ({paper.publication_year})
        </div>
        <div className='text-sm'>Citations: {paper.cited_by_count}</div>
        <div className='flex gap-4 text-sm text-blue-600 mt-1'>
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target='_blank'
              className='underline'
            >
              DOI
            </a>
          )}
          {paper.pdf_url && (
            <a href={paper.pdf_url} target='_blank' className='underline'>
              PDF
            </a>
          )}
        </div>
        <p className='text-sm text-gray-700 mt-2'>
          {buildAbstract(paper.abstract)}
        </p>
      </div>

      {/* REFERENCES */}
      <div>
        <h2 className='font-semibold'>References (Cited by this paper)</h2>
        {cites.map((r) => (
          <Link
            key={`references-${r.id}`}
            href={`/paper/${r.id}`}
            className='block border-b py-2 hover:bg-gray-50'
          >
            <div className='font-medium text-blue-600'>{r.title}</div>
            <div className='text-sm text-gray-700'>{r.authors.join(', ')}</div>
            <div className='text-xs text-gray-500'>
              {r.journal_name} — {r.publication_year} — Citations:{' '}
              {r.cited_by_count}
            </div>
          </Link>
        ))}
        {loadingCites && (
          <div className='text-sm text-gray-500'>Loading more…</div>
        )}
        {referencedWorks.length > cites.length && (
          <button
            onClick={() => {
              const next = citesPage + 1;
              setCitesPage(next);
              fetchCites(next, referencedWorks);
            }}
            className='border px-3 py-1 mt-2 text-sm'
          >
            More references
          </button>
        )}
      </div>

      {/* RELATED PAPERS */}
      <div>
        <h2 className='font-semibold'>Related Papers</h2>
        {related.map((r) => (
          <Link
            key={`related-${r.id}`}
            href={`/paper/${r.id}`}
            className='block border-b py-2 hover:bg-gray-50'
          >
            <div className='font-medium text-blue-600'>{r.title}</div>
            <div className='text-sm text-gray-700'>{r.authors.join(', ')}</div>
            <div className='text-xs text-gray-500'>
              {r.journal_name} — {r.publication_year} — Citations:{' '}
              {r.cited_by_count}
            </div>
          </Link>
        ))}
        {loadingRelated && (
          <div className='text-sm text-gray-500'>Loading more…</div>
        )}
        <button
          onClick={() => setRelatedPage((p) => p + 1)}
          className='border px-3 py-1 mt-2 text-sm'
        >
          More Related Papers
        </button>
      </div>

      {/* CITED PAPERS */}
      <div>
        <h2 className='font-semibold'>Cited Papers</h2>
        {cited.map((r) => (
          <Link
            key={`cited-${r.id}`}
            href={`/paper/${r.id}`}
            className='block border-b py-2 hover:bg-gray-50'
          >
            <div className='font-medium text-blue-600'>{r.title}</div>
            <div className='text-sm text-gray-700'>{r.authors.join(', ')}</div>
            <div className='text-xs text-gray-500'>
              {r.journal_name} — {r.publication_year} — Citations:{' '}
              {r.cited_by_count}
            </div>
          </Link>
        ))}
        {loadingCited && (
          <div className='text-sm text-gray-500'>Loading more…</div>
        )}
        <button
          onClick={() => setCitedPage((p) => p + 1)}
          className='border px-3 py-1 mt-2 text-sm'
        >
          More Cited Papers
        </button>
      </div>
    </div>
  );
}
