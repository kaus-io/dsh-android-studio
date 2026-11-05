/**
 * Language catalogue for the reader: file-extension routing plus the lexical
 * rules each language family needs. Data only — the scanner lives in `lexer.ts`.
 *
 * The extension table mirrors the host's shared code-language table so the
 * reader can claim exactly the suffixes the product Code preview claims; a few
 * document/image suffixes stay with their specialised product viewers.
 */

/** How a language's lines become tokens. */
export type LanguageFamily =
  | 'generic'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'ini'
  | 'css'
  | 'markup'
  | 'diff'
  | 'log'
  | 'http'
  | 'tex'
  | 'plain'

/** One quoted-string form. `multiline` strings may continue on later lines. */
export interface StringRule {
  readonly open: string
  readonly close: string
  readonly multiline?: boolean
  readonly escape?: boolean
}

/** One block-comment form. */
export interface BlockCommentRule {
  readonly open: string
  readonly close: string
  readonly nested?: boolean
}

/** Which token class the identifier after a declaration keyword receives. */
export type DeclKind = 'type' | 'function' | 'variable'

/** Everything the scanner needs for one language. */
export interface LanguageSpec {
  readonly id: string
  readonly label: string
  readonly family: LanguageFamily
  readonly keywords: ReadonlySet<string>
  readonly types?: ReadonlySet<string>
  readonly constants?: ReadonlySet<string>
  readonly lineComments?: readonly string[]
  readonly blockComments?: readonly BlockCommentRule[]
  readonly strings?: readonly StringRule[]
  readonly decl?: Readonly<Record<string, DeclKind>>
  readonly annotation?: boolean
  readonly variables?: boolean
  readonly preprocessor?: boolean
  readonly caseInsensitive?: boolean
  readonly capitalizedTypes?: boolean
  readonly functionByCall?: boolean
  readonly indentFolding?: boolean
  readonly regexLiterals?: boolean
}

const words = (source: string): ReadonlySet<string> => new Set(source.split(/\s+/).filter(Boolean))
const lower = (source: string): ReadonlySet<string> => new Set(source.toLowerCase().split(/\s+/).filter(Boolean))

const DQ: StringRule = { open: '"', close: '"', escape: true }
const SQ: StringRule = { open: "'", close: "'", escape: true }
const BT: StringRule = { open: '`', close: '`', escape: true, multiline: true }
const TDQ: StringRule = { open: '"""', close: '"""', escape: true, multiline: true }
const TSQ: StringRule = { open: "'''", close: "'''", escape: true, multiline: true }

const C_BLOCK: BlockCommentRule = { open: '/*', close: '*/' }
const NESTED_C_BLOCK: BlockCommentRule = { open: '/*', close: '*/', nested: true }

/** Extension -> canonical language id, matching the host's shared table. */
const EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  typescript: ['ts', 'tsx', 'mts', 'cts'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  shellscript: ['sh', 'bash', 'zsh'],
  fish: ['fish'],
  json: ['json', 'jsonc', 'jsonl', 'ndjson', 'ipynb'],
  csv: ['csv'],
  python: ['py', 'pyw', 'pyi'],
  ruby: ['rb', 'rake', 'gemspec'],
  go: ['go'],
  rust: ['rs'],
  java: ['java'],
  c: ['c', 'h'],
  cpp: ['cc', 'cpp', 'cxx', 'hh', 'hpp', 'hxx'],
  csharp: ['cs'],
  kotlin: ['kt', 'kts'],
  swift: ['swift'],
  php: ['php'],
  yaml: ['yaml', 'yml'],
  toml: ['toml'],
  ini: ['ini', 'conf', 'cfg', 'properties'],
  dotenv: ['env'],
  log: ['log'],
  diff: ['diff', 'patch'],
  http: ['http'],
  markdown: ['md', 'markdown'],
  mdx: ['mdx'],
  rst: ['rst'],
  latex: ['tex', 'sty', 'cls'],
  bibtex: ['bib'],
  asciidoc: ['adoc'],
  html: ['html', 'htm', 'xhtml'],
  css: ['css'],
  scss: ['scss'],
  less: ['less'],
  sql: ['sql'],
  xml: ['xml', 'xsd', 'xsl', 'xslt', 'plist', 'svg'],
  lua: ['lua'],
  bat: ['bat', 'cmd'],
  powershell: ['ps1', 'psm1', 'psd1'],
  r: ['r'],
  julia: ['jl'],
  dart: ['dart'],
  scala: ['scala'],
  clojure: ['clj', 'cljs', 'edn'],
  erlang: ['erl', 'hrl'],
  elixir: ['ex', 'exs'],
  haskell: ['hs'],
  fsharp: ['fs', 'fsi', 'fsx'],
  vb: ['vb'],
  perl: ['pl', 'pm'],
  verilog: ['v'],
  'system-verilog': ['sv', 'svh'],
  graphql: ['graphql', 'gql'],
  proto: ['proto'],
  hcl: ['tf', 'tfvars', 'hcl'],
  nix: ['nix'],
  vue: ['vue'],
  svelte: ['svelte'],
  make: ['makefile', 'mk'],
  cmake: ['cmake'],
  groovy: ['gradle', 'groovy'],
}

/**
 * Suffixes whose product viewer is a better default than a code reader
 * (images, HTML preview, Markdown, spreadsheets/notebooks). They still reach
 * this reader from the preview's viewer menu.
 */
const SPECIALISED = new Set(['csv', 'ipynb', 'html', 'htm', 'xhtml', 'md', 'markdown', 'mdx', 'svg'])

/** Extension -> language id for every suffix this reader recognises. */
export const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map(
  Object.entries(EXTENSIONS).flatMap(([language, suffixes]) => suffixes.map((suffix) => [suffix, language] as const)),
)

/** Suffixes this reader registers as its own default document viewer. */
export const REGISTERED_EXTENSIONS: readonly string[] = [...LANGUAGE_BY_EXTENSION.keys()]
  .filter((extension) => !SPECIALISED.has(extension))
  .sort()

const SPECS: Record<string, LanguageSpec> = {
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    family: 'generic',
    keywords: words(
      'abstract any as asserts async await bigint boolean break case catch class const constructor continue debugger declare default delete do else enum export extends finally for from function get global if implements import in infer instanceof interface is keyof let module namespace never new null number object of package private protected public readonly require return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield',
    ),
    types: words(
      'Array Boolean Date Error Function Map Number Object Promise Record Set String Symbol RegExp JSON Math Console Window Document HTMLElement Event Partial Required Readonly Pick Omit Exclude Extract NonNullable ReturnType Parameters',
    ),
    constants: words('true false null undefined NaN Infinity'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ, SQ, BT],
    regexLiterals: true,
    decl: { class: 'type', interface: 'type', enum: 'type', namespace: 'type', type: 'type', function: 'function', const: 'variable', let: 'variable', var: 'variable' },
  },
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    family: 'generic',
    keywords: words(
      'async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield',
    ),
    types: words('Array Boolean Date Error Function Map Number Object Promise RegExp Set String Symbol JSON Math Console Window Document HTMLElement Event'),
    constants: words('true false null undefined NaN Infinity'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ, SQ, BT],
    regexLiterals: true,
    decl: { class: 'type', function: 'function', const: 'variable', let: 'variable', var: 'variable' },
  },
  java: {
    id: 'java',
    label: 'Java',
    family: 'generic',
    keywords: words(
      'abstract assert break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try var void volatile while record sealed permits yield true false null',
    ),
    types: words(
      'String Object Integer Long Double Float Boolean Character Byte Short List Map Set Collection Collections Arrays Optional Stream Collectors Iterator Iterable ArrayList HashMap HashSet LinkedList TreeMap TreeSet Exception RuntimeException Thread Class System Math StringBuilder StringBuffer',
    ),
    constants: words('true false null'),
    preprocessor: false,
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [TDQ, DQ, SQ],
    annotation: true,
    decl: { class: 'type', interface: 'type', enum: 'type', record: 'type' },
  },
  kotlin: {
    id: 'kotlin',
    label: 'Kotlin',
    family: 'generic',
    keywords: words(
      'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit noinline open operator out override private protected public reified sealed suspend tailrec vararg it',
    ),
    types: words(
      'Int Long Short Byte Float Double Boolean Char String Any Unit Nothing List MutableList Map MutableMap Set MutableSet Array Sequence Pair Triple Result Throwable Exception RuntimeException Comparable Iterable Collection',
    ),
    constants: words('true false null'),
    lineComments: ['//'],
    blockComments: [NESTED_C_BLOCK],
    strings: [TDQ, DQ, SQ],
    annotation: true,
    decl: { class: 'type', interface: 'type', object: 'type', enum: 'type', typealias: 'type', fun: 'function', val: 'variable', var: 'variable' },
  },
  scala: {
    id: 'scala',
    label: 'Scala',
    family: 'generic',
    keywords: words(
      'abstract case catch class def do else enum extends false final finally for forSome if implicit import lazy match new null object override package private protected return sealed super this throw trait true try type val var while with yield given using then',
    ),
    types: words('Int Long Double Float Boolean Char String Unit Any Nothing List Seq Set Map Option Either Future Try Array'),
    constants: words('true false null'),
    lineComments: ['//'],
    blockComments: [NESTED_C_BLOCK],
    strings: [TDQ, DQ, SQ],
    annotation: true,
    decl: { class: 'type', trait: 'type', object: 'type', enum: 'type', def: 'function', val: 'variable', var: 'variable' },
  },
  groovy: {
    id: 'groovy',
    label: 'Groovy',
    family: 'generic',
    keywords: words(
      'abstract as assert break case catch class const continue def default do else enum extends final finally for goto if implements import in instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws trait transient try var void volatile while',
    ),
    types: words('String Object Integer Long Double Float Boolean List Map Set Closure GString'),
    constants: words('true false null'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [TDQ, DQ, SQ],
    annotation: true,
    decl: { class: 'type', interface: 'type', enum: 'type', trait: 'type', def: 'function' },
  },
  c: {
    id: 'c',
    label: 'C',
    family: 'generic',
    keywords: words(
      'auto break case const continue default do else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while',
    ),
    types: words('char double float int long short signed unsigned void size_t ssize_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE bool'),
    constants: words('NULL true false'),
    preprocessor: true,
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ, SQ],
    decl: { struct: 'type', union: 'type', enum: 'type' },
  },
  cpp: {
    id: 'cpp',
    label: 'C++',
    family: 'generic',
    keywords: words(
      'alignas alignof and and_eq asm auto bitand bitor bool break case catch char class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq override final',
    ),
    types: words('string vector map set unordered_map unique_ptr shared_ptr size_t std::string int8_t uint8_t int16_t uint16_t int32_t uint32_t int64_t uint64_t'),
    constants: words('NULL true false nullptr'),
    preprocessor: true,
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ, SQ],
    decl: { class: 'type', struct: 'type', union: 'type', enum: 'type', namespace: 'type' },
  },
  csharp: {
    id: 'csharp',
    label: 'C#',
    family: 'generic',
    keywords: words(
      'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while async await var record init get set when where yield partial global nameof',
    ),
    types: words('int long short byte uint ulong ushort sbyte float double decimal bool char string object dynamic void Task ValueTask List Dictionary IEnumerable IList Exception Action Func'),
    constants: words('true false null'),
    preprocessor: true,
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [TDQ, DQ, SQ],
    annotation: true,
    decl: { class: 'type', interface: 'type', struct: 'type', enum: 'type', record: 'type', namespace: 'type' },
  },
  go: {
    id: 'go',
    label: 'Go',
    family: 'generic',
    keywords: words(
      'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    ),
    types: words('bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable'),
    constants: words('true false nil iota'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ, SQ, BT],
    decl: { func: 'function', type: 'type', var: 'variable', const: 'variable' },
  },
  rust: {
    id: 'rust',
    label: 'Rust',
    family: 'generic',
    keywords: words(
      'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while yield',
    ),
    types: words('bool char str i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 String Vec Option Result Box Rc Arc HashMap HashSet VecDeque'),
    constants: words('true false None Some Ok Err'),
    lineComments: ['//'],
    blockComments: [NESTED_C_BLOCK],
    strings: [DQ, SQ],
    annotation: true,
    decl: { fn: 'function', struct: 'type', enum: 'type', trait: 'type', impl: 'type', mod: 'type', type: 'type', let: 'variable', const: 'variable', static: 'variable' },
  },
  swift: {
    id: 'swift',
    label: 'Swift',
    family: 'generic',
    keywords: words(
      'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as any catch false is nil super self Self throw throws true try',
    ),
    types: words('Int Double Float String Bool Character Array Dictionary Set Optional Result Error Void Any AnyObject UInt Int8 Int16 Int32 Int64'),
    constants: words('true false nil'),
    lineComments: ['//'],
    blockComments: [NESTED_C_BLOCK],
    strings: [TDQ, DQ],
    annotation: true,
    decl: { func: 'function', class: 'type', struct: 'type', enum: 'type', protocol: 'type', extension: 'type', actor: 'type', let: 'variable', var: 'variable' },
  },
  dart: {
    id: 'dart',
    label: 'Dart',
    family: 'generic',
    keywords: words(
      'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield',
    ),
    types: words('int double num bool String List Map Set Future Stream Object dynamic void'),
    constants: words('true false null'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [TDQ, DQ, SQ],
    annotation: true,
    decl: { class: 'type', enum: 'type', mixin: 'type', extension: 'type', typedef: 'type' },
  },
  php: {
    id: 'php',
    label: 'PHP',
    family: 'generic',
    keywords: words(
      'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
    ),
    types: words('int float string bool array object mixed void never callable iterable self static parent'),
    constants: words('true false null'),
    lineComments: ['//', '#'],
    blockComments: [C_BLOCK],
    strings: [DQ, SQ],
    variables: true,
    decl: { class: 'type', interface: 'type', trait: 'type', enum: 'type', function: 'function' },
  },
  python: {
    id: 'python',
    label: 'Python',
    family: 'generic',
    keywords: words(
      'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
    ),
    types: words(
      'int float complex bool str bytes bytearray list dict set tuple frozenset range object type Exception ValueError TypeError KeyError IndexError RuntimeError self cls',
    ),
    constants: words('True False None NotImplemented Ellipsis'),
    lineComments: ['#'],
    strings: [TDQ, TSQ, DQ, SQ],
    annotation: true,
    indentFolding: true,
    decl: { def: 'function', class: 'type' },
  },
  ruby: {
    id: 'ruby',
    label: 'Ruby',
    family: 'generic',
    keywords: words(
      'BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require attr_accessor attr_reader attr_writer include extend private protected public',
    ),
    types: words('Array Hash String Symbol Integer Float Range Proc Regexp IO File Dir Time Exception StandardError'),
    constants: words('true false nil'),
    lineComments: ['#'],
    strings: [DQ, SQ],
    variables: true,
    decl: { def: 'function', class: 'type', module: 'type' },
  },
  shellscript: {
    id: 'shellscript',
    label: 'Shell',
    family: 'generic',
    keywords: words('if then else elif fi case esac for while until do done in function select return break continue local declare typeset export readonly unset shift source alias'),
    constants: words('true false'),
    lineComments: ['#'],
    strings: [DQ, SQ, BT],
    variables: true,
    decl: { function: 'function' },
  },
  fish: {
    id: 'fish',
    label: 'Fish',
    family: 'generic',
    keywords: words('if else end for while function switch case return break continue set and or not in begin'),
    lineComments: ['#'],
    strings: [DQ, SQ, BT],
    variables: true,
    decl: { function: 'function' },
  },
  powershell: {
    id: 'powershell',
    label: 'PowerShell',
    family: 'generic',
    keywords: words(
      'begin break catch class continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function if in param process return switch throw trap try until using var while',
    ),
    types: words('int string bool array hashtable psobject void'),
    lineComments: ['#'],
    blockComments: [{ open: '<#', close: '#>' }],
    strings: [DQ, SQ],
    variables: true,
    caseInsensitive: true,
    decl: { function: 'function', class: 'type', enum: 'type' },
  },
  bat: {
    id: 'bat',
    label: 'Batch',
    family: 'generic',
    keywords: words('if else goto call exit set setlocal endlocal for in do not exist errorlevel echo off on'),
    lineComments: ['::'],
    strings: [DQ],
    variables: true,
    caseInsensitive: true,
  },
  lua: {
    id: 'lua',
    label: 'Lua',
    family: 'generic',
    keywords: words('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
    types: words('string table math io os ipairs pairs print require'),
    constants: words('true false nil'),
    lineComments: ['--'],
    blockComments: [{ open: '--[[', close: ']]' }],
    strings: [DQ, SQ],
    decl: { function: 'function' },
  },
  r: {
    id: 'r',
    label: 'R',
    family: 'generic',
    keywords: words('if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA'),
    types: words('numeric character logical integer double list data.frame matrix vector'),
    lineComments: ['#'],
    strings: [DQ, SQ],
    capitalizedTypes: false,
  },
  julia: {
    id: 'julia',
    label: 'Julia',
    family: 'generic',
    keywords: words(
      'abstract baremodule begin break catch const continue do else elseif end export false finally for function global if import in isa let local macro module mutable primitive quote return struct true try using while',
    ),
    types: words('Int Float64 String Bool Vector Matrix Array Dict Tuple Nothing Any'),
    constants: words('true false nothing missing'),
    lineComments: ['#'],
    strings: [TDQ, DQ, SQ, BT],
    decl: { function: 'function', struct: 'type', mutable: 'type', abstract: 'type', primitive: 'type', module: 'type' },
  },
  elixir: {
    id: 'elixir',
    label: 'Elixir',
    family: 'generic',
    keywords: words(
      'after alias and case catch cond def defdelegate defexception defguard defimpl defmacro defmodule defp defprotocol defstruct do else end fn for if import in is nil not or quote raise receive require rescue reraise super throw try unless unquote use when with true false',
    ),
    types: words('Atom BitString Float Function Integer List Map PID Port Reference Tuple'),
    constants: words('true false nil'),
    lineComments: ['#'],
    strings: [TDQ, DQ, SQ],
    decl: { def: 'function', defp: 'function', defmacro: 'function', defmodule: 'type', defprotocol: 'type' },
  },
  erlang: {
    id: 'erlang',
    label: 'Erlang',
    family: 'generic',
    keywords: words('after and andalso band begin bnot bor bsl bsr bxor case catch cond div end fun if let not of or orelse receive rem try when xor'),
    constants: words('true false'),
    lineComments: ['%'],
    strings: [DQ],
  },
  haskell: {
    id: 'haskell',
    label: 'Haskell',
    family: 'generic',
    keywords: words('case class data default deriving do else if import in infix infixl infixr instance let module newtype of then type where'),
    types: words('Int Integer Float Double Char String Bool Maybe Either IO'),
    lineComments: ['--'],
    blockComments: [{ open: '{-', close: '-}', nested: true }],
    strings: [DQ],
    decl: { data: 'type', newtype: 'type', type: 'type', class: 'type', module: 'type' },
  },
  clojure: {
    id: 'clojure',
    label: 'Clojure',
    family: 'generic',
    keywords: words(
      'def defn defmacro defmethod defmulti defonce defrecord deftype defprotocol ns let fn if do loop recur when cond case and or not nil true false throw try catch finally new set! quote var import require use',
    ),
    lineComments: [';'],
    strings: [DQ],
    decl: { defn: 'function', defmacro: 'function', def: 'variable', ns: 'type', defrecord: 'type', deftype: 'type' },
  },
  fsharp: {
    id: 'fsharp',
    label: 'F#',
    family: 'generic',
    keywords: words(
      'abstract and as assert base begin class default delegate do done downcast downto elif else end exception extern false finally for fun function global if in inherit inline interface internal lazy let match member module mutable namespace new not null of open or override private public rec return select static struct then to true try type upcast use val void when while with yield',
    ),
    types: words('int float string bool list array option seq map set unit'),
    constants: words('true false null'),
    lineComments: ['//'],
    blockComments: [{ open: '(*', close: '*)', nested: true }],
    strings: [TDQ, DQ],
    decl: { let: 'function', member: 'function', type: 'type', module: 'type' },
  },
  vb: {
    id: 'vb',
    label: 'Visual Basic',
    family: 'generic',
    keywords: lower(
      'AddHandler AddressOf Alias And AndAlso As Boolean ByRef Byte ByVal Call Case Catch CBool CByte CChar CDate CDbl CDec Char CInt Class CLng CObj Const Continue CSByte CShort CSng CStr CType CUInt CULng CUShort Date Decimal Declare Default Delegate Dim DirectCast Do Double Each Else ElseIf End EndIf Enum Erase Error Event Exit False Finally For Friend Function Get GetType Global GoSub GoTo Handles If Implements Imports In Inherits Integer Interface Is IsNot Let Lib Like Long Loop Me Mod Module MustInherit MustOverride MyBase MyClass Namespace Narrowing New Next Not Nothing NotInheritable NotOverridable Object Of On Operator Option Optional Or OrElse Out Overloads Overridable Overrides ParamArray Partial Private Property Protected Public RaiseEvent ReadOnly ReDim REM RemoveHandler Resume Return SByte Select Set Shadows Shared Short Single Static Step Stop String Structure Sub SyncLock Then Throw To True Try TryCast TypeOf UInteger ULong UShort Using Variant Wend When While Widening With WithEvents WriteOnly Xor',
    ),
    types: words('integer string boolean double single long short byte date decimal object'),
    constants: words('true false nothing'),
    lineComments: ["'"],
    strings: [DQ],
    caseInsensitive: true,
    capitalizedTypes: false,
    decl: { class: 'type', module: 'type', structure: 'type', interface: 'type', sub: 'function', function: 'function', dim: 'variable' },
  },
  perl: {
    id: 'perl',
    label: 'Perl',
    family: 'generic',
    keywords: words('my our local sub use package require if elsif else unless while for foreach do last next redo return die warn eval'),
    lineComments: ['#'],
    strings: [DQ, SQ, BT],
    variables: true,
    decl: { sub: 'function', package: 'type' },
  },
  verilog: {
    id: 'verilog',
    label: 'Verilog',
    family: 'generic',
    keywords: words(
      'always and assign begin buf bufif0 bufif1 case casex casez cmos deassign default defparam disable edge else end endcase endfunction endmodule endprimitive endspecify endtable endtask event for force forever fork function if initial inout input integer join large macromodule medium module nand negedge nmos nor not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared small specify specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned vectored wait wand weak0 weak1 while wire wor xnor xor',
    ),
    types: words('wire reg logic bit byte int integer real time'),
    constants: words('0 1 x z'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ],
    decl: { module: 'type', function: 'function', task: 'function' },
  },
  'system-verilog': {
    id: 'system-verilog',
    label: 'SystemVerilog',
    family: 'generic',
    keywords: words(
      'always always_comb always_ff always_latch and assert assign assume begin bind bins bit break byte case casex casez class clocking const continue cover covergroup default do else end endcase endclass endfunction endmodule endpackage endtask enum export extends extern final for force foreach forever fork function generate if import initial inout input int interface join logic longint module new output package packed parameter property protected pure rand randc real ref reg repeat return shortint signed static string struct super task this time typedef union unsigned virtual void wait while wire',
    ),
    types: words('bit logic int integer longint shortint byte real time string'),
    constants: words('0 1 x z'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ],
    decl: { module: 'type', class: 'type', interface: 'type', package: 'type', function: 'function', task: 'function' },
  },
  graphql: {
    id: 'graphql',
    label: 'GraphQL',
    family: 'generic',
    keywords: words('query mutation subscription fragment on schema scalar type interface union enum input extend directive implements repeatable'),
    types: words('ID String Int Float Boolean'),
    lineComments: ['#'],
    strings: [TDQ, DQ],
    decl: { type: 'type', interface: 'type', union: 'type', enum: 'type', input: 'type', scalar: 'type', schema: 'type', query: 'function', mutation: 'function', subscription: 'function', fragment: 'function' },
  },
  proto: {
    id: 'proto',
    label: 'Protocol Buffers',
    family: 'generic',
    keywords: words('syntax package import option message enum service rpc returns repeated optional required oneof map reserved extend extensions to max stream'),
    types: words('double float int32 int64 uint32 uint64 sint32 sint64 fixed32 fixed64 sfixed32 sfixed64 bool string bytes'),
    constants: words('true false'),
    lineComments: ['//'],
    blockComments: [C_BLOCK],
    strings: [DQ],
    decl: { message: 'type', enum: 'type', service: 'type', rpc: 'function' },
  },
  hcl: {
    id: 'hcl',
    label: 'HCL',
    family: 'generic',
    keywords: words('resource data module variable output locals provider terraform for_each count depends_on lifecycle dynamic content'),
    constants: words('true false null'),
    lineComments: ['#', '//'],
    blockComments: [C_BLOCK],
    strings: [DQ],
    decl: { resource: 'type', data: 'type', module: 'type', variable: 'type', output: 'type', provider: 'type', terraform: 'type' },
  },
  nix: {
    id: 'nix',
    label: 'Nix',
    family: 'generic',
    keywords: words('let in with rec inherit assert if then else or import derivation builtins true false null'),
    lineComments: ['#'],
    blockComments: [C_BLOCK],
    strings: [DQ, { open: "''", close: "''", multiline: true }],
    capitalizedTypes: false,
  },
  make: {
    id: 'make',
    label: 'Makefile',
    family: 'generic',
    keywords: words('ifeq ifneq ifdef ifndef else endif include define endef export unexport override'),
    lineComments: ['#'],
    strings: [DQ],
    capitalizedTypes: false,
  },
  cmake: {
    id: 'cmake',
    label: 'CMake',
    family: 'generic',
    keywords: words('if elseif else endif foreach endforeach while endwhile function endfunction macro endmacro set unset list project cmake_minimum_required add_executable add_library target_link_libraries target_include_directories install message option find_package include'),
    lineComments: ['#'],
    strings: [DQ],
    capitalizedTypes: false,
    caseInsensitive: true,
    decl: { function: 'function', macro: 'function' },
  },
  json: { id: 'json', label: 'JSON', family: 'json', keywords: words('true false null'), constants: words('true false null') },
  yaml: { id: 'yaml', label: 'YAML', family: 'yaml', keywords: words('true false null yes no on off'), constants: words('true false null yes no on off'), indentFolding: true },
  toml: { id: 'toml', label: 'TOML', family: 'toml', keywords: words('true false'), constants: words('true false') },
  ini: { id: 'ini', label: 'INI', family: 'ini', keywords: words('true false'), constants: words('true false') },
  dotenv: { id: 'dotenv', label: 'Dotenv', family: 'ini', keywords: words('true false'), constants: words('true false') },
  sql: {
    id: 'sql',
    label: 'SQL',
    family: 'generic',
    keywords: lower(
      'add all alter and any as asc begin between by case check column commit constraint create cross database default delete desc distinct drop else end escape except exec exists foreign from full function grant group having if in index inner insert into is join key left like limit not null on or order outer primary procedure references right rollback select set table then top transaction trigger truncate union unique update values view when where with',
    ),
    types: words('int integer varchar char text date datetime timestamp boolean decimal numeric float double serial bigint smallint blob clob uuid json jsonb'),
    constants: words('true false null'),
    lineComments: ['--'],
    blockComments: [C_BLOCK],
    strings: [SQ, DQ],
    caseInsensitive: true,
    capitalizedTypes: false,
    decl: { create: 'type', table: 'type', function: 'function', procedure: 'function' },
  },
  css: { id: 'css', label: 'CSS', family: 'css', keywords: words('important inherit initial unset revert auto none block flex grid inline absolute relative fixed sticky hidden visible'), constants: words('true false') },
  scss: { id: 'scss', label: 'SCSS', family: 'css', keywords: words('important inherit initial unset revert auto none block flex grid extend mixin include function if else each for while'), constants: words('true false') },
  less: { id: 'less', label: 'Less', family: 'css', keywords: words('important inherit initial unset revert auto none block flex grid extend'), constants: words('true false') },
  html: { id: 'html', label: 'HTML', family: 'markup', keywords: words(''), constants: words('true false') },
  xml: { id: 'xml', label: 'XML', family: 'markup', keywords: words(''), constants: words('true false') },
  diff: { id: 'diff', label: 'Diff', family: 'diff', keywords: words(''), constants: words('') },
  log: { id: 'log', label: 'Log', family: 'log', keywords: words(''), constants: words('') },
  http: { id: 'http', label: 'HTTP', family: 'http', keywords: words('GET POST PUT PATCH DELETE HEAD OPTIONS TRACE CONNECT'), constants: words('true false') },
  latex: { id: 'latex', label: 'LaTeX', family: 'tex', keywords: words('begin end documentclass usepackage section subsection paragraph label ref cite item newcommand renewcommand include input'), constants: words('') },
}

/** Look up a spec by canonical language id. */
export function specById(id: string | undefined): LanguageSpec {
  if (id !== undefined) {
    const spec = SPECS[id]
    if (spec !== undefined) return spec
  }
  return PLAIN
}

/** Resolve the language for a path (case-insensitive suffix). */
export function languageForPath(path: string): string | undefined {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const base = path.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  if (dot < 0) return undefined
  return LANGUAGE_BY_EXTENSION.get(base.slice(dot + 1).toLowerCase())
}

/** Human label for a language id, for the reader's status strip. */
export function labelForLanguage(id: string | undefined): string {
  return specById(id).label
}

const PLAIN: LanguageSpec = {
  id: 'plain',
  label: 'Plain text',
  family: 'plain',
  keywords: words(''),
  capitalizedTypes: false,
}

/** Display labels for the viewer dropdown. */
export function viewerLabel(id: string | undefined): string {
  return id === undefined ? 'Code' : specById(id).label
}
