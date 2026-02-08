import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMovieMemoConfig } from './config.js'
import { createApp } from './app.js'
import { logger } from './logger.js'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

const config = loadMovieMemoConfig()
const app = createApp(config)

app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      paymentEnabled: config.paymentEnabled,
      payTo: config.evmAddress,
    },
    'MovieMemo server started',
  )
})
