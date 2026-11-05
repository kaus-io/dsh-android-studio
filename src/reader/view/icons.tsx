/** Inline 15px icons matching the host's stroke weight. */
import type { ReactElement } from 'react'

interface IconProps {
  readonly size?: number
}

function Stroke({ children, size = 15 }: IconProps & { readonly children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function OutlineIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M3 4h1.2M3 8h1.2M3 12h1.2" />
      <path d="M6.4 4h6.4M6.4 8h6.4M6.4 12h6.4" />
    </Stroke>
  )
}

export function SearchIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <circle cx={7} cy={7} r={3.8} />
      <path d="m10 10 3.2 3.2" />
    </Stroke>
  )
}

export function GotoIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M2.6 4.4v7.2M5.4 4.4v7.2" />
      <path d="M8.4 8h4.8" />
      <path d="m10.9 5.7 2.4 2.3-2.4 2.3" />
    </Stroke>
  )
}

export function FoldIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M5 6.2 8 3.4l3 2.8" />
      <path d="M5 9.8 8 12.6l3-2.8" />
    </Stroke>
  )
}

export function CopyIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <rect x={5.6} y={5.6} width={7.6} height={7.6} rx={1.7} />
      <path d="M10.3 3.4H4.9A1.5 1.5 0 0 0 3.4 4.9v5.4" />
    </Stroke>
  )
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m3.4 8.4 2.9 2.9 6.3-6.7" />
    </Stroke>
  )
}

export function CloseIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />
    </Stroke>
  )
}

export function ChevronRightIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m6.2 3.8 4.2 4.2-4.2 4.2" />
    </Stroke>
  )
}

export function ChevronDownIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m3.8 6.2 4.2 4.2 4.2-4.2" />
    </Stroke>
  )
}

export function ArrowUpIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M8 12.6V3.6M4.4 7.2 8 3.6l3.6 3.6" />
    </Stroke>
  )
}

export function ArrowDownIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M8 3.4v9M4.4 8.8 8 12.4l3.6-3.6" />
    </Stroke>
  )
}

export function FileIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M4 2.4h5l3 3v8.2H4z" />
      <path d="M9 2.6v3h3" />
    </Stroke>
  )
}
