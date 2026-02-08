import type { Request, Response } from 'express'
import { logger } from '../logger.js'
import { movieInfoHandler } from './movie-info.js'
import { careerTrendsHandler } from './career-trends.js'
import { soundtrackHandler } from './soundtrack.js'

type NlpIntent = 'movie-info' | 'career-trends' | 'soundtrack'

const SOUNDTRACK_KEYWORDS = [
  /soundtrack/gi,
  /\bost\b/gi,
  /score/gi,
  /music/gi,
  /songs?/gi,
  /配乐/g,
  /音乐/g,
  /歌曲/g,
  /原声/g,
]

const CAREER_KEYWORDS = [
  /career/gi,
  /trends?/gi,
  /filmography/gi,
  /职业/g,
  /生涯/g,
  /履历/g,
  /趋势/g,
]

const DIRECTOR_KEYWORDS = [/director/gi, /导演/g]
const ACTOR_KEYWORDS = [/actor/gi, /actress/gi, /演员/g]

const MOVIE_NOISE = [
  /movie/gi,
  /film/gi,
  /电影/g,
  /的/g,
  /一下/g,
  /帮我/g,
  /请/g,
  /查询/g,
  /问/g,
  /想要/g,
  /我要/g,
  /给我/g,
  /有关/g,
]

function normalizeQuery(text: string, removals: RegExp[]): string {
  let cleaned = text
  for (const pattern of removals) {
    cleaned = cleaned.replace(pattern, ' ')
  }
  cleaned = cleaned.replace(/[“”"']/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function detectIntent(text: string): NlpIntent {
  if (hasAny(text, SOUNDTRACK_KEYWORDS)) return 'soundtrack'
  if (hasAny(text, CAREER_KEYWORDS) || hasAny(text, DIRECTOR_KEYWORDS) || hasAny(text, ACTOR_KEYWORDS)) {
    return 'career-trends'
  }
  return 'movie-info'
}

function extractMovieQuery(text: string): string {
  const removals = [...SOUNDTRACK_KEYWORDS, ...MOVIE_NOISE]
  const cleaned = normalizeQuery(text, removals)
  return cleaned || text
}

function extractPersonQuery(text: string): { query: string; type: 'director' | 'actor' } {
  const type: 'director' | 'actor' = hasAny(text, DIRECTOR_KEYWORDS) ? 'director' : 'actor'
  const removals = [
    ...CAREER_KEYWORDS,
    ...DIRECTOR_KEYWORDS,
    ...ACTOR_KEYWORDS,
    ...MOVIE_NOISE,
  ]
  const cleaned = normalizeQuery(text, removals)
  return { query: cleaned || text, type }
}

export async function nlpHandler(req: Request, res: Response): Promise<void> {
  const rawText = typeof req.body?.text === 'string'
    ? req.body.text
    : typeof req.body?.query === 'string'
      ? req.body.query
      : ''

  if (!rawText) {
    res.status(400).json({ error: 'Missing text parameter' })
    return
  }

  const intent = detectIntent(rawText)
  logger.info({ intent, rawText }, 'NLP routing request')

  if (intent === 'soundtrack') {
    req.body = { query: extractMovieQuery(rawText) }
    await soundtrackHandler(req, res)
    return
  }

  if (intent === 'career-trends') {
    const { query, type } = extractPersonQuery(rawText)
    req.body = { query, type }
    await careerTrendsHandler(req, res)
    return
  }

  req.body = { query: extractMovieQuery(rawText) }
  await movieInfoHandler(req, res)
}
