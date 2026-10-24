// Rows added to the bottom of the Movies, Shows and Hindi tabs as they
// are scrolled. Each one is a YouTube search kept to the trusted official channels,
// so it only ever shows their uploads. Add, remove or reorder freely.

// 'movie' themes go on the Movies tab, 'show' themes on the Shows tab and
// 'hindi' themes on the Hindi tab.
export type Theme = { title: string; query: string; kind: 'movie' | 'show' | 'hindi' };

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
  { title: 'Bollywood comedies', query: 'hindi comedy full movie', kind: 'hindi' },
  { title: 'Romantic Hindi movies', query: 'hindi romantic full movie', kind: 'hindi' },
  { title: 'South movies in Hindi', query: 'south hindi dubbed full movie', kind: 'hindi' },
  { title: 'Family dramas', query: 'hindi family drama full movie', kind: 'hindi' },
  { title: 'Akshay Kumar movies', query: 'Akshay Kumar full hindi movie', kind: 'hindi' },
  { title: 'Govinda movies', query: 'Govinda full hindi movie', kind: 'hindi' },
  { title: 'Hindi thrillers', query: 'hindi thriller full movie', kind: 'hindi' },
  { title: 'Ajay Devgn movies', query: 'Ajay Devgn full hindi movie', kind: 'hindi' },
  { title: 'Classic Bollywood', query: '90s bollywood full hindi movie', kind: 'hindi' },
];
