import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";

export type ArtworkBranch = "illustration" | "illustrationLowRes" | "illustrationBlur";

const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const resourceRaw = "https://raw.githubusercontent.com/7aGiven/Phigros_Resource";
export const artworkPlaceholder = "/assets/phi-plugin/otherimg/phigros.png";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];
const resourcePath = (songId: string) => encodeURIComponent(songId);

/**
 * Keep the public artwork lookup in one place. jsDelivr is normally faster;
 * GitHub Raw is a reliable fallback when a CDN edge is rate limited or cold.
 * The full illustration is also a useful fallback for the low-res/blur branches
 * because a missing branch file should never leave a broken image icon.
 */
export const artworkSources = (songId: string, branch: ArtworkBranch = "illustrationLowRes") => {
  const id = resourcePath(songId);
  const branches: ArtworkBranch[] = branch === "illustration" ? ["illustration"] : [branch, "illustration"];
  return unique(branches.flatMap((item) => [
    `${resourceCdn}@${item}/${id}.png`,
    `${resourceRaw}/${item}/${id}.png`,
  ]));
};

export const artworkCssValue = (songId: string, branch: ArtworkBranch = "illustrationBlur") =>
  artworkSources(songId, branch).map((source) => `url("${source}")`).join(",");

type SourceImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  sources: string[];
  fallbackSrc?: string;
};

/** An image that advances through remote candidates instead of showing a broken icon. */
export function SourceImage({ sources, fallbackSrc = artworkPlaceholder, onError, ...props }: SourceImageProps) {
  const candidates = useMemo(() => unique(sources), [sources]);
  const candidateKey = candidates.join("\u0000");
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [candidateKey]);

  const source = candidates[index] ?? fallbackSrc;
  return <img
    {...props}
    src={source}
    onError={(event) => {
      if (index < candidates.length - 1) {
        setIndex((current) => Math.min(current + 1, candidates.length - 1));
        return;
      }
      if (event.currentTarget.dataset.fallbackApplied !== "true") {
        event.currentTarget.dataset.fallbackApplied = "true";
        event.currentTarget.src = fallbackSrc;
      }
      onError?.(event);
    }}
  />;
}

type ArtworkImageProps = Omit<SourceImageProps, "sources"> & {
  songId: string;
  branch?: ArtworkBranch;
};

export function ArtworkImage({ songId, branch = "illustrationLowRes", ...props }: ArtworkImageProps) {
  return <SourceImage {...props} sources={artworkSources(songId, branch)} />;
}
