export interface MovieInfoRequest {
  query: string;
}

export interface CareerTrendsRequest {
  query: string;
  type: 'director' | 'actor';
}

export interface SoundtrackRequest {
  query: string;
}

export interface MovieInfoResponse {
  data: {
    title: string;
    director: string;
    cast: string[];
    rating: number;
    boxOffice: string;
    plot: string;
    releaseDate: string;
    genres: string[];
    posterUrl: string | null;
  };
}

export interface CareerTrendsResponse {
  data: {
    name: string;
    type: 'director' | 'actor';
    totalMovies: number;
    averageRating: number;
    topMovies: Array<{
      title: string;
      year: string;
      rating: number;
    }>;
    ratingTrend: string;
  };
}

export interface SoundtrackResponse {
  data: {
    movieTitle: string;
    tracks: Array<{
      name: string;
      youtubeSearchUrl: string;
      sceneDescription: string;
    }>;
  };
}
