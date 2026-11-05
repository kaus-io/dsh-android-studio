/** Robustness: fuzz every language scanner and analyze real project sources. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { analyzeText } from '../src/reader/engine/analysis.ts'
import { splitLines, tokenize } from '../src/reader/engine/lexer.ts'
import { LANGUAGE_BY_EXTENSION, specById } from '../src/reader/engine/languages.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)

const ALPHABET = [
  'a', 'Z', '0', '9', '_', '$', '@', '%', '#', ' ', '\t', '\n', '\r',
  '"', "'", '`', '\\', '/', '*', '-', '+', '=', '<', '>', '{', '}', '(', ')',
  '[', ']', ':', ';', ',', '.', '!', '?', '&', '|', '^', '~', '中', '文', 'é',
  'f', 'n', 'u', 'c', 't', 'i', 'o', 'r', 'e', 's', 'l', 'p', 'v', 'd',
]

function randomText(length: number, seed: number): string {
  let value = 0
  for (let index = 0; index < seed.toString().length; index++) value = (value * 31 + seed.toString().charCodeAt(index)) >>> 0
  let out = ''
  for (let index = 0; index < length; index++) {
    value = (value * 1664525 + 1013904223) >>> 0
    out += ALPHABET[value % ALPHABET.length]
  }
  return out
}

type Tokens = ReturnType<typeof analyzeText>['tokens']

function assertContiguous(text: string, tokens: Tokens): void {
  const lines = splitLines(text)
  assert.equal(tokens.length, lines.length, 'one token row per line')
  for (let line = 0; line < lines.length; line++) {
    const row = tokens[line]
    let cursor = 0
    for (const token of row) {
      assert.equal(token.start, cursor, `token start on line ${line}`)
      assert.ok(token.text.length > 0, `empty token on line ${line}`)
      cursor += token.text.length
    }
    assert.equal(cursor, lines[line].length, `line ${line} coverage`)
    assert.equal(row.map((token) => token.text).join(''), lines[line], `line ${line} text`)
  }
}

test('every language scanner survives random input with full coverage', () => {
  const languages = [...new Set([...LANGUAGE_BY_EXTENSION.values(), 'plain'])]
  for (const language of languages) {
    const spec = specById(language)
    for (let seed = 1; seed <= 12; seed++) {
      const text = randomText(seed * 31 + (seed % 5), seed * 7 + language.length)
      const tokens = tokenize(text, spec)
      assertContiguous(text, tokens)
    }
  }
})

test('truncated constructs do not leak state into unrelated lines', () => {
  const cases: Array<[string, string]> = [
    ['kotlin', '/* never closed\nval x = 1\nval y = 2'],
    ['python', '"""never closed\nx = 1\n'],
    ['typescript', '`template\nconst x = 1'],
    ['xml', '<div attr="unterminated\n<p>ok</p>'],
    ['yaml', 'key: "unterminated\nnext: 1'],
    ['css', '/* open\n.a { color: red }'],
  ]
  for (const [language, text] of cases) {
    const analysis = analyzeText(text, language)
    assert.equal(analysis.degraded, false)
    assertContiguous(analysis.text, analysis.tokens)
  }
})

test('real TypeScript sources analyze into outline, folds and searchable tokens', async () => {
  const files = ['src/reader/engine/lexer.ts', 'src/reader/view/CodeReader.tsx', 'src/reader/plugin.tsx']
  for (const relative of files) {
    const source = await readFile(path.join(root, relative), 'utf8')
    const analysis = analyzeText(source, 'typescript')
    assert.equal(analysis.degraded, false)
    assertContiguous(analysis.text, analysis.tokens)
    assert.ok(analysis.outline.length > 3, `${relative} outline`)
    assert.ok(analysis.folds.length > 3, `${relative} folds`)
    assert.ok(analysis.outline.some((symbol) => symbol.name.length > 0 && symbol.kind !== 'field'), `${relative} named symbols`)
    const first = analysis.outline[0]
    assert.ok(first !== undefined)
    assert.ok(first.endLine >= first.line)
  }
})

test('real Kotlin and Java files keep plausible structure', () => {
  const kotlin = [
    'package com.example.app',
    '',
    'import androidx.compose.runtime.Composable',
    '',
    '@Composable',
    'fun Greeting(name: String, count: Int = 1) {',
    '    val message = "Hello, $name"',
    '    println(message)',
    '}',
    '',
    'enum class State { Idle, Loading }',
    '',
    'interface Repo {',
    '    fun load(id: Long): List<String>',
    '}',
  ].join('\n')
  const analysis = analyzeText(kotlin, 'kotlin')
  assertContiguous(analysis.text, analysis.tokens)
  const names = analysis.outline.map((symbol) => symbol.name)
  assert.ok(names.includes('Greeting'))
  assert.ok(names.includes('State'))
  assert.ok(names.includes('Repo'))
  assert.ok(analysis.folds.some((fold) => fold.start === 5), 'function body folds')

  const java = [
    'public final class Service {',
    '    private final Repo repo;',
    '',
    '    public Service(Repo repo) {',
    '        this.repo = repo;',
    '    }',
    '',
    '    public List<String> load(long id) {',
    '        return repo.load(id);',
    '    }',
    '}',
  ].join('\n')
  const javaAnalysis = analyzeText(java, 'java')
  const javaNames = javaAnalysis.outline.map((symbol) => symbol.name)
  assert.ok(javaNames.includes('Service'))
  assert.ok(javaNames.includes('load'))
  assert.ok(javaNames.includes('repo'))
})
