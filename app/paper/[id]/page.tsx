'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import parsePapers from '../../../utils/parsePapers';
import buildAbstract from '../../../utils/abstract';
import { Paper } from '../../../types/interfaces';
import Link from 'next/link';

export default function PaperPage() {
  const params = useParams();
  const rawId = params?.id;

  const [paper, setPaper] = useState<Paper | null>(null);
  const [referencedWorks, setReferencedWorks] = useState<string[]>([]);

  const [cites, setCites] = useState<Paper[]>([]);
  const [citesPage, setCitesPage] = useState(1);

  const [related, setRelated] = useState<Paper[]>([]);
  const [relatedPage, setRelatedPage] = useState(1);

  const [cited, setCited] = useState<Paper[]>([]);
  const [citedPage, setCitedPage] = useState(1);

  const [loadingPaper, setLoadingPaper] = useState(true);
  const [loadingCites, setLoadingCites] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [loadingCited, setLoadingCited] = useState(false);

  const paperId =
    typeof rawId === 'string'
      ? rawId
      : Array.isArray(rawId)
      ? rawId[0]
      : undefined;

  // Memoized helper function
  const fetchPapersByIds = useCallback(
    async (ids: string[]): Promise<Paper[]> => {
      const papers: Paper[] = [];
      for (const url of ids) {
        const id = url.split('/').pop();
        if (!id) continue;
        try {
          const res = await axios.get(`https://api.openalex.org/works/${id}`);
          const [p] = parsePapers([res.data]);
          papers.push(p);
        } catch {}
      }
      return papers;
    },
    []
  );

  // Reset state when paperId changes
  useEffect(() => {
    setPaper(null);
    setReferencedWorks([]);
    setCites([]);
    setCitesPage(1);
    setRelated([]);
    setRelatedPage(1);
    setCited([]);
    setCitedPage(1);
    setLoadingPaper(true);
    setLoadingCites(false);
    setLoadingRelated(false);
    setLoadingCited(false);
  }, [paperId]);

  // Fetch main paper
  useEffect(() => {
    if (!paperId) return;

    let isCancelled = false;

    const fetchPaper = async () => {
      setLoadingPaper(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works/${paperId}`
        );
        if (isCancelled) return;

        const [p] = parsePapers([res.data]);
        setPaper(p);
        setReferencedWorks(res.data.referenced_works || []);
      } finally {
        if (!isCancelled) setLoadingPaper(false);
      }
    };

    fetchPaper();

    return () => {
      isCancelled = true;
    };
  }, [paperId]);

  // Fetch references (cited by this paper)
  useEffect(() => {
    if (referencedWorks.length === 0) return;

    let isCancelled = false;

    const fetchReferences = async () => {
      setLoadingCites(true);
      const batch = referencedWorks.slice((citesPage - 1) * 3, citesPage * 3);
      if (!batch.length) {
        setLoadingCites(false);
        return;
      }

      const newPapers = await fetchPapersByIds(batch);

      if (!isCancelled) {
        setCites((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...newPapers.filter((p) => !seen.has(p.id))];
        });
        setLoadingCites(false);
      }
    };

    fetchReferences();

    return () => {
      isCancelled = true;
    };
  }, [citesPage, referencedWorks, fetchPapersByIds]);

  // Fetch related papers
  useEffect(() => {
    if (!paperId) return;

    let isCancelled = false;

    const fetchRelated = async () => {
      setLoadingRelated(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works?filter=related_to:${paperId}&per-page=3&page=${relatedPage}`
        );
        const newPapers = parsePapers(res.data.results);

        if (!isCancelled) {
          setRelated((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...newPapers.filter((p) => !seen.has(p.id))];
          });
        }
      } finally {
        if (!isCancelled) setLoadingRelated(false);
      }
    };

    fetchRelated();

    return () => {
      isCancelled = true;
    };
  }, [relatedPage, paperId]);

  // Fetch citing papers
  useEffect(() => {
    if (!paperId) return;

    let isCancelled = false;

    const fetchCiting = async () => {
      setLoadingCited(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works?filter=cites:${paperId}&per-page=3&page=${citedPage}`
        );
        const newPapers = parsePapers(res.data.results);

        if (!isCancelled) {
          setCited((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...newPapers.filter((p) => !seen.has(p.id))];
          });
        }
      } finally {
        if (!isCancelled) setLoadingCited(false);
      }
    };

    fetchCiting();

    return () => {
      isCancelled = true;
    };
  }, [citedPage, paperId]);

  // Conditional rendering
  if (!paperId) return <div>Paper ID not found</div>;
  if (loadingPaper || !paper) return <div>Loading paper…</div>;

  const renderPaperList = (list: Paper[], prefix: string) =>
    list.map((r) => (
      <Link
        key={`${prefix}-${r.id}-${paperId}`}
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
    ));

  return (
    <div className='max-w-5xl mx-auto py-8 space-y-8'>
      {/* MAIN PAPER */}
      <div className='bg-white p-6 rounded-xl shadow-md'>
        <h1 className='text-3xl font-bold text-blue-600'>{paper.title}</h1>
        <div className='text-sm text-gray-700 mt-1'>
          {paper.authors.join(', ')}
        </div>
        <div className='text-sm text-gray-500'>
          {paper.journal_name} ({paper.publication_year})
        </div>
        <div className='mt-2 flex flex-wrap gap-2 items-center'>
          <span className='text-sm text-gray-500'>
            Citations: {paper.cited_by_count}
          </span>
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target='_blank'
              className='text-sm px-3 py-1 border rounded bg-blue-50 hover:bg-blue-100 transition'
            >
              DOI
            </a>
          )}
          {paper.pdf_url && (
            <a
              href={paper.pdf_url}
              target='_blank'
              className='text-sm px-3 py-1 border rounded bg-green-50 hover:bg-green-100 transition'
            >
              PDF
            </a>
          )}
        </div>
        <p className='text-gray-700 mt-4 leading-relaxed'>
          {buildAbstract(paper.abstract)}
        </p>
      </div>

      {/* REFERENCES */}
      <div className='space-y-2'>
        <h2 className='text-xl font-semibold'>
          References (Cited by this paper)
        </h2>
        <div className='grid md:grid-cols-2 gap-4'>
          {renderPaperList(cites, 'references').map((item) => (
            <div
              className='bg-white p-4 rounded-lg shadow hover:shadow-md transition'
              key={item.key}
            >
              {item}
            </div>
          ))}
        </div>
        {referencedWorks.length > cites.length && (
          <button
            onClick={() => setCitesPage((p) => p + 1)}
            className='mt-2 px-4 py-2 border rounded bg-gray-50 hover:bg-gray-100 transition'
          >
            Load more references
          </button>
        )}
      </div>

      {/* RELATED PAPERS */}
      <div className='space-y-2'>
        <h2 className='text-xl font-semibold'>Related Papers</h2>
        <div className='grid md:grid-cols-2 gap-4'>
          {renderPaperList(related, 'related').map((item) => (
            <div
              className='bg-white p-4 rounded-lg shadow hover:shadow-md transition'
              key={item.key}
            >
              {item}
            </div>
          ))}
        </div>
        <button
          onClick={() => setRelatedPage((p) => p + 1)}
          className='mt-2 px-4 py-2 border rounded bg-gray-50 hover:bg-gray-100 transition'
        >
          Load more related
        </button>
      </div>

      {/* CITED PAPERS */}
      <div className='space-y-2'>
        <h2 className='text-xl font-semibold'>Cited Papers</h2>
        <div className='grid md:grid-cols-2 gap-4'>
          {renderPaperList(cited, 'cited').map((item) => (
            <div
              className='bg-white p-4 rounded-lg shadow hover:shadow-md transition'
              key={item.key}
            >
              {item}
            </div>
          ))}
        </div>
        <button
          onClick={() => setCitedPage((p) => p + 1)}
          className='mt-2 px-4 py-2 border rounded bg-gray-50 hover:bg-gray-100 transition'
        >
          Load more citations
        </button>
      </div>
    </div>
  );
}
