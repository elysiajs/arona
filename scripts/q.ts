import { sql } from '@arona/libs'
import { search, SQL } from '@arona/modules/ai/libs'

await search('better auth').then(x => x.map(x => console.log(x.title)))
