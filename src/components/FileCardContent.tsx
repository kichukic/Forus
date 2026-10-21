import { useEffect, useState } from 'react';
import { findArtwork, parseFileName, type Artwork } from '../api/artwork';
import { VideoCardContent } from './Cards';

type Props = {
  fileName: string;
  detail?: string; // e.g. the file size
  // The picture's height, for a grid of smaller cards.
  height?: number;
};

// Inside of a TorBox card: the title's artwork once found, with a tidy name on it.
export function FileCardContent({ fileName, detail, height }: Props) {
  const [art, setArt] = useState<Artwork | null>(null);

  useEffect(() => {
    let cancelled = false;
    findArtwork(fileName)
      .then((a) => !cancelled && setArt(a))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fileName]);

  const parsed = parseFileName(fileName);
  const year = art?.year ?? parsed.year;

  return (
    <VideoCardContent
      image={art?.image}
      placeholder={parsed.title}
      title={`${art ? art.title : parsed.title}${year ? ` (${year})` : ''}`}
      subtitle={detail}
      height={height}
    />
  );
}
