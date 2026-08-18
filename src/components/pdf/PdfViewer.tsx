import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  AlignHorizontalJustifyStart,
} from "lucide-react";
import type { FileItem } from "../../types";
import { fetchPdfData, downloadFile } from "../../services/storage";
import { friendlyError } from "../../lib/utils";
import { Button, Spinner } from "../ui/primitives";
import { useToast } from "../../contexts/ToastContext";

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<PdfPage>;
      destroy: () => Promise<void>;
    }>;
  };
}

interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
}

type PdfDoc = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

export function PdfViewer({ file }: { file: FileItem }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const docRef = useRef<PdfDoc | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const renderSeq = useRef(0);

  /* ------------------------------------------------ load document once */
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setErrMsg("");

    void (async () => {
      try {
        const [pdfjs, workerMod] = await Promise.all([
          import("pdfjs-dist") as unknown as Promise<PdfJsModule>,
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
        const data = await fetchPdfData(file.storage_path);
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
        setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setErrMsg(friendlyError(err, "Unable to load this PDF. It may have been removed from storage."));
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (docRef.current) {
        void docRef.current.destroy().catch(() => undefined);
        docRef.current = null;
      }
    };
  }, [file.id, file.storage_path]);

  /* ------------------------------------------------ render current page */
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!doc || !canvas || !wrap || phase !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const seq = ++renderSeq.current;
    try {
      const pg = await doc.getPage(page);
      if (seq !== renderSeq.current) return;
      const base = pg.getViewport({ scale: 1 });
      const containerW = wrap.clientWidth || 800;
      const effective = fitWidth
        ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, (containerW - 28) / base.width))
        : scale;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = pg.getViewport({ scale: effective * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const task = pg.render({ canvasContext: ctx, viewport });
      await task.promise;
    } catch {
      /* render cancelled or failed — next render will retry */
    }
  }, [page, scale, fitWidth, phase]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  // re-render on container resize (orientation change, panel toggles)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      if (fitWidth) void renderPage();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fitWidth, renderPage]);

  // fullscreen state
  useEffect(() => {
    const onChange = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const gotoPage = (n: number) => setPage(Math.min(Math.max(1, n), Math.max(numPages, 1)));

  const zoomBy = (factor: number) => {
    setFitWidth(false);
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((s * factor).toFixed(2)))));
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (frameRef.current) {
      void frameRef.current.requestFullscreen();
    }
  };

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadFile(file);
      toast("Download started");
    } catch (err) {
      toast(friendlyError(err, "Download failed. Please try again."), "error");
    } finally {
      setDownloading(false);
    }
  };

  const toolBtn =
    "flex h-8.5 items-center justify-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold text-ink-600 transition-colors hover:bg-ink-150 hover:text-ink-900 disabled:opacity-40 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50";

  return (
    <div ref={frameRef} className="flex h-full min-h-0 flex-col rounded-xl border border-ink-200 bg-white shadow-card dark:border-ink-800 dark:bg-ink-900">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-200 px-2.5 py-1.5 dark:border-ink-800">
        <button type="button" className={toolBtn} onClick={() => gotoPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4.5 w-4.5" />
        </button>
        <div className="flex items-center gap-1 text-[12.5px] font-semibold text-ink-600 dark:text-ink-300">
          <input
            type="number"
            min={1}
            max={Math.max(numPages, 1)}
            value={page}
            onChange={(e) => gotoPage(Number(e.target.value) || 1)}
            aria-label="Current page"
            className="h-7.5 w-12 rounded-md border border-ink-200 bg-transparent text-center text-[12.5px] font-bold text-ink-900 focus:border-brand-500 focus:outline-none dark:border-ink-700 dark:text-ink-100"
          />
          <span>/ {numPages || "—"}</span>
        </div>
        <button type="button" className={toolBtn} onClick={() => gotoPage(page + 1)} disabled={page >= numPages} aria-label="Next page">
          <ChevronRight className="h-4.5 w-4.5" />
        </button>

        <span className="mx-1.5 h-5 w-px bg-ink-200 dark:bg-ink-700" aria-hidden="true" />

        <button type="button" className={toolBtn} onClick={() => zoomBy(1 / 1.25)} disabled={fitWidth} aria-label="Zoom out">
          <ZoomOut className="h-4.5 w-4.5" />
        </button>
        <span className="min-w-11 text-center text-[12px] font-bold tabular-nums text-ink-500 dark:text-ink-400">
          {fitWidth ? "Fit" : `${Math.round(scale * 100)}%`}
        </span>
        <button type="button" className={toolBtn} onClick={() => zoomBy(1.25)} disabled={fitWidth} aria-label="Zoom in">
          <ZoomIn className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => setFitWidth((v) => !v)}
          aria-pressed={fitWidth}
          aria-label="Fit to width"
          title="Fit to width"
        >
          <AlignHorizontalJustifyStart className="h-4.5 w-4.5" />
          <span className="hidden sm:inline">Fit</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={toolBtn} onClick={toggleFullscreen} aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}>
            {isFs ? <Minimize className="h-4.5 w-4.5" /> : <Maximize className="h-4.5 w-4.5" />}
          </button>
          <Button variant="primary" size="sm" loading={downloading} onClick={() => void onDownload()}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>
      </div>

      {/* canvas area */}
      <div ref={wrapRef} className="min-h-0 flex-1 overflow-auto bg-ink-150/70 p-3.5 dark:bg-ink-950/70">
        {phase === "loading" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-500 dark:text-ink-400">
            <Spinner className="h-6 w-6 text-brand-500" />
            <p className="text-sm font-semibold">Loading PDF…</p>
          </div>
        ) : phase === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-display text-base font-bold text-ink-800 dark:text-ink-100">Can't preview this PDF</p>
            <p className="max-w-sm text-[13px] text-ink-500 dark:text-ink-400">{errMsg}</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => void onDownload()}>
              <Download className="h-3.5 w-3.5" /> Try downloading instead
            </Button>
          </div>
        ) : (
          <canvas ref={canvasRef} className="mx-auto block rounded-md shadow-pop" aria-label={`Page ${page} of ${file.name}`} />
        )}
      </div>
    </div>
  );
}
