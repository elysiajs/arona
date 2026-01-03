import { sql } from '../src/libs'
import { readPage } from '../src/modules/ai/libs'

const file = 'patterns/openapi'

readPage(file).then(console.log)
