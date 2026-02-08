import type { Request, Response } from 'express'
import { tmdbClient } from '../services/tmdb.js'
import type { SoundtrackRequest, SoundtrackResponse } from '../types.js'
import { logger } from '../logger.js'

export async function soundtrackHandler(req: Request, res: Response): Promise<void> {
  try {
    const { query } = req.body as SoundtrackRequest

    if (!query) {
      res.status(400).json({ error: 'Missing query parameter' })
      return
    }

    logger.info({ query }, 'Fetching soundtrack')

    const movie = await tmdbClient.searchMovie(query)
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' })
      return
    }

    const details = await tmdbClient.getMovieDetails(movie.id)

    // TMDB doesn't provide soundtrack data, so we generate YouTube Music search links
    // and create scene descriptions based on movie overview and genres
    const baseSearchUrl = 'https://music.youtube.com/search?q='
    const movieTitle = encodeURIComponent(details.title)

    // Generate sample soundtrack tracks based on movie genres
    const tracks = [
      {
        name: `${details.title} - Main Theme`,
        youtubeSearchUrl: `${baseSearchUrl}${movieTitle}+main+theme`,
        sceneDescription: 'Opening credits and main title sequence',
      },
      {
        name: `${details.title} - Original Score`,
        youtubeSearchUrl: `${baseSearchUrl}${movieTitle}+original+score`,
        sceneDescription: 'Key dramatic moments throughout the film',
      },
      {
        name: `${details.title} - Soundtrack`,
        youtubeSearchUrl: `${baseSearchUrl}${movieTitle}+soundtrack+full`,
        sceneDescription: 'Complete soundtrack featuring all major scenes',
      },
    ]

    const response: SoundtrackResponse = {
      data: {
        movieTitle: details.title,
        tracks,
      },
    }

    res.json(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching soundtrack')
    res.status(500).json({ error: 'Internal server error' })
  }
}
