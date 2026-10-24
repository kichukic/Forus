// Backward-compatibility shim for cinebox -> moviedbbox
export * from './moviedbbox';
export {
  fetchMovieDbTrending as trendingCinebox,
  fetchMovieDbSearch as searchCinebox,
  fetchMovieDbDetails as fetchCineboxDetails,
} from './moviedbbox';
export type {
  MovieDbType as CineboxType,
  MovieDbItem as CineboxItem,
  MovieDbDetails as CineboxDetails,
} from './moviedbbox';
