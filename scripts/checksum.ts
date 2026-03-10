import { AI } from '@arona/modules/ai/service'

const content = await Bun.file('scripts/word.txt').text()

console.log(AI.Checksum.generate(content))
