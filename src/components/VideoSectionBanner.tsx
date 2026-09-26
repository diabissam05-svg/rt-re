import { useState } from "react";
import { Link } from "react-router-dom";
import { Volume2, VolumeX, ArrowRight } from "lucide-react";
import { useCms } from "../lib/store";
import { loc } from "../lib/i18n";
import { parseVideoSource } from "../lib/video";
import Reveal from "./Reveal";

/**
 * Homepage promotional video banner — fully driven by the admin
 * "SECTION VIDÉO" CMS tab (visibility, source, poster, texts, CTA).
 */
export default function VideoSectionBanner() {
  const { state, lang } = useCms();
  const section = state.videoSection;
  const [muted, setMuted] = useState(true);

  if (!section?.enabled || !section.videoUrl) return null;
  const source = parseVideoSource(section.videoUrl, { autoplay: true, muted, loop: true });
  if (!source) return null;

  return (
    <section className="bg-onyx py-14">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <div className="relative aspect-video w-full bg-black md:aspect-[21/9]">
              {source.kind === "file" ? (
                <video
                  className="h-full w-full object-cover"
                  src={source.src}
                  poster={section.poster || undefined}
                  autoPlay
                  muted={muted}
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <iframe
                  className="h-full w-full"
                  src={source.src}
                  title={loc(section.title, lang)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  frameBorder={0}
                  style={{ border: 0 }}
                />
              )}

              {/* Overlay gradient */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/35" />

              {/* Overlay content */}
              <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
                {section.badge.fr && (
                  <span className="mb-3 inline-flex w-fit rounded border border-brand/50 bg-brand/10 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.25em] text-brand backdrop-blur-sm">
                    {loc(section.badge, lang)}
                  </span>
                )}
                <h2 className="font-display max-w-3xl text-3xl font-extrabold uppercase leading-tight tracking-wide text-white sm:text-5xl">
                  {loc(section.title, lang)}
                </h2>
                <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
                  {loc(section.subtitle, lang)}
                </p>
                {section.ctaLabel.fr && (
                  <Link
                    to={section.ctaLink || "/shop"}
                    className="group mt-5 flex w-fit items-center gap-2 rounded bg-brand px-6 py-3 font-display text-sm font-bold uppercase tracking-wider text-black transition-all hover:bg-brand-strong hover:shadow-xl hover:shadow-brand/40"
                  >
                    {loc(section.ctaLabel, lang)}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1 rtl:rotate-180" />
                  </Link>
                )}
              </div>

              {/* Mute toggle (direct video files) */}
              {source.kind === "file" && (
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="absolute end-4 top-4 flex items-center gap-2 rounded-lg border border-white/20 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition-all hover:border-brand hover:text-brand"
                >
                  {muted ? <VolumeX size={15} className="text-brand" /> : <Volume2 size={15} className="text-brand" />}
                  {muted ? "Activer le son" : "Couper le son"}
                </button>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
