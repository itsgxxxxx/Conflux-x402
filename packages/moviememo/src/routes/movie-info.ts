import type { Request, Response } from 'express'
import { tmdbClient } from '../services/tmdb.js'
import type { MovieInfoRequest, MovieInfoResponse } from '../types.js'
import { logger } from '../logger.js'

export async function movieInfoHandler(req: Request, res: Response): Promise<void> {
  try {
    const { query } = req.body as MovieInfoRequest

    if (!query) {
      res.status(400).json({ error: 'Missing query parameter' })
      return
    }

    logger.info({ query }, 'Fetching movie info')

    const movie = await tmdbClient.searchMovie(query)
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' })
      return
    }

    const [details, credits] = await Promise.all([
      tmdbClient.getMovieDetails(movie.id),
      tmdbClient.getMovieCredits(movie.id),
    ])

    const director = credits.crew.find((c) => c.job === 'Director')?.name ?? 'Unknown'
    const cast = credits.cast.slice(0, 5).map((c) => c.name)

    const response: MovieInfoResponse = {
      data: {
        title: details.title,
        director,
        cast,
        rating: details.vote_average,
        boxOffice: details.revenue > 0 ? `$${(details.revenue / 1_000_000).toFixed(1)}M` : 'N/A',
        plot: details.overview,
        releaseDate: details.release_date,
        genres: details.genres.map((g) => g.name),
        posterUrl: tmdbClient.getPosterUrl(details.poster_path),
      },
    }

    res.json(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching movie info')
    res.status(500).json({ error: 'Internal server error' })
  }
}
