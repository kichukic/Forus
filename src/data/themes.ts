// Rows added to the bottom of the Movies and Shows tabs as they are scrolled. Each one is a
// YouTube search kept to the trusted official channels, so it only ever shows
// their uploads. Add, remove or reorder freely.

// 'movie' themes go on the Movies tab, 'show' themes on the Shows tab.
export type Theme = { title: string; query: string; kind: 'movie' | 'show' };

export const THEMES: Theme[] = [
  { title: 'Mohanlal movies', query: 'Mohanlal malayalam full movie', kind: 'movie' },
  { title: 'Mammootty movies', query: 'Mammootty malayalam full movie', kind: 'movie' },
  { title: 'Comedy movies', query: 'malayalam comedy full movie', kind: 'movie' },
  { title: 'Uppum Mulakum', query: 'Uppum Mulakum full episode', kind: 'show' },
  { title: 'Dileep movies', query: 'Dileep malayalam full movie', kind: 'movie' },
  { title: 'Marimayam', query: 'Marimayam full episode', kind: 'show' },
  { title: 'Thrillers', query: 'malayalam thriller full movie', kind: 'movie' },
  { title: 'Jayaram family movies', query: 'Jayaram malayalam full movie', kind: 'movie' },
  { title: 'Aliyans', query: 'Aliyans latest episode', kind: 'show' },
  { title: 'Prithviraj movies', query: 'Prithviraj malayalam full movie', kind: 'movie' },
  { title: 'Family movies', query: 'malayalam family full movie', kind: 'movie' },
  { title: 'Oru Chiri Iru Chiri Bumper Chiri', query: 'Oru Chiri Iru Chiri Bumper Chiri', kind: 'show' },
  { title: 'Action movies', query: 'malayalam action full movie', kind: 'movie' },
  { title: 'Jagathy comedy', query: 'Jagathy Sreekumar comedy', kind: 'show' },
  { title: 'Suresh Gopi movies', query: 'Suresh Gopi malayalam full movie', kind: 'movie' },
  { title: 'Sancharam travelogues', query: 'Sancharam Safari TV', kind: 'show' },
  { title: 'Kunchacko Boban movies', query: 'Kunchacko Boban malayalam full movie', kind: 'movie' },
  { title: 'Classic movies', query: 'old malayalam classic full movie', kind: 'movie' },
  { title: 'Jayasurya movies', query: 'Jayasurya malayalam full movie', kind: 'movie' },
  { title: 'Romantic movies', query: 'malayalam romantic full movie', kind: 'movie' },
  { title: 'Comedy Stars', query: 'Comedy Stars Asianet', kind: 'show' },
  { title: 'Dubbed movies', query: 'malayalam dubbed full movie', kind: 'movie' },
  { title: 'Indrajith movies', query: 'Indrajith malayalam full movie', kind: 'movie' },
  { title: 'Kalabhavan Mani movies', query: 'Kalabhavan Mani malayalam full movie', kind: 'movie' },
];
