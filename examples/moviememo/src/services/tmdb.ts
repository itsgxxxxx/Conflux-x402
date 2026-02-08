const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  vote_average: number;
  poster_path: string | null;
  overview: string;
  budget: number;
  revenue: number;
  genres: Array<{ id: number; name: string }>;
}

export interface TMDBCredits {
  cast: Array<{ id: number; name: string; character: string; order: number }>;
  crew: Array<{ id: number; name: string; job: string; department: string }>;
}

export interface TMDBPerson {
  id: number;
  name: string;
  known_for_department: string;
}

export interface TMDBPersonMovies {
  cast?: Array<{ id: number; title: string; release_date: string; vote_average: number }>;
  crew?: Array<{ id: number; title: string; release_date: string; vote_average: number; job: string }>;
}

class TMDBClient {
  private apiKey: string | null = null;

  private getApiKey(): string {
    if (this.apiKey) {
      return this.apiKey;
    }

    const key = process.env.TMDB_API_KEY;
    if (!key) {
      throw new Error(
        'TMDB_API_KEY is not configured. Get your free API key at https://www.themoviedb.org/settings/api'
      );
    }
    this.apiKey = key;
    return this.apiKey;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', this.getApiKey());

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url.toString());

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid TMDB API key. Please check your configuration.');
        }
        throw new Error(`TMDB API error: ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown TMDB API error');
    }
  }

  async searchMovie(title: string): Promise<TMDBMovie | null> {
    const data = await this.request<{ results: TMDBMovie[] }>('/search/movie', {
      query: title,
      language: 'en-US',
    });

    if (data.results.length === 0) {
      return null;
    }

    return data.results[0];
  }

  async getMovieDetails(movieId: number): Promise<TMDBMovie> {
    return this.request<TMDBMovie>(`/movie/${movieId}`, {
      language: 'en-US',
    });
  }

  async getMovieCredits(movieId: number): Promise<TMDBCredits> {
    return this.request<TMDBCredits>(`/movie/${movieId}/credits`);
  }

  async searchPerson(name: string): Promise<TMDBPerson | null> {
    const data = await this.request<{ results: TMDBPerson[] }>('/search/person', {
      query: name,
      language: 'en-US',
    });

    if (data.results.length === 0) {
      return null;
    }

    return data.results[0];
  }

  async getPersonMovies(personId: number): Promise<TMDBPersonMovies> {
    return this.request<TMDBPersonMovies>(`/person/${personId}/movie_credits`);
  }

  getPosterUrl(posterPath: string | null, size: string = 'w500'): string | null {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
  }
}

export const tmdbClient = new TMDBClient();
