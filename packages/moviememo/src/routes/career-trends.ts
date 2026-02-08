import type { Request, Response } from 'express'
import { tmdbClient } from '../services/tmdb.js'
import type { CareerTrendsRequest, CareerTrendsResponse } from '../types.js'
import { logger } from '../logger.js'

export async function careerTrendsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { query, type } = req.body as CareerTrendsRequest

    if (!query || !type) {
      res.status(400).json({ error: 'Missing query or type parameter' })
      return
    }

    logger.info({ query, type }, 'Fetching career trends')

    const person = await tmdbClient.searchPerson(query)
    if (!person) {
      res.status(404).json({ error: 'Person not found' })
      return
    }

    const movies = await tmdbClient.getPersonMovies(person.id)

    const relevantMovies = type === 'director'
      ? (movies.crew ?? []).filter((m) => m.job === 'Director')
      : (movies.cast ?? [])

    const sortedMovies = relevantMovies
      .filter((m) => m.release_date && m.vote_average > 0)
      .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())

    const totalMovies = sortedMovies.length
    const averageRating = totalMovies > 0
      ? sortedMovies.reduce((sum, m) => sum + m.vote_average, 0) / totalMovies
      : 0

    const topMovies = [...sortedMovies]
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 3)
      .map((m) => ({
        title: m.title,
        year: m.release_date.split('-')[0],
        rating: m.vote_average,
      }))

    const recentMovies = sortedMovies.slice(0, 5)
    const recentAvg = recentMovies.length > 0
      ? recentMovies.reduce((sum, m) => sum + m.vote_average, 0) / recentMovies.length
      : 0

    const ratingTrend = recentAvg > averageRating
      ? 'Improving - recent works rated higher than career average'
      : recentAvg < averageRating
      ? 'Declining - recent works rated lower than career average'
      : 'Stable - consistent ratings across career'

    const response: CareerTrendsResponse = {
      data: {
        name: person.name,
        type,
        totalMovies,
        averageRating: Math.round(averageRating * 10) / 10,
        topMovies,
        ratingTrend,
      },
    }

    res.json(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching career trends')
    res.status(500).json({ error: 'Internal server error' })
  }
}
