/**
 * Android Studio browser half. Bundled by build-client.mjs with the code-reader
 * sources under src/reader; `client.js` is the generated artifact.
 */
import * as React from 'react'
import * as Model from './ui-model.js'
import enLocale from './locale/en.json'
import zhLocale from './locale/zh.json'
import type { ArtifactRow, Device, Job, JobFrame, PopupPosition, Project } from './ui-model.js'

const {
  UI_OUTPUT_LIMIT, UI_RUNNING, OBSERVE_ACTIONS, OBSERVE_PATH, ACTION_PATH, SIGN_PATH,
  SECRET_LIMIT, MENU_INITIAL, menuReducer, selectCurrentSession, showSessionToolbar,
  sessionSelectionKey, popupGeometry, SELECTION_STORAGE_KEY, SELECTION_STORAGE_LIMIT,
  sanitizeSelection, isUnsafeVariant, reconcileModule, wirelessAddress, isWirelessSerial,
  chooseDevice, runBlockedReason, wizardSteps, wizardError, wizardRequest,
  suggestSignedOutput, artifactRows, mergeJobFrame,
} = Model

const LOCALES = { en: enLocale.ui as Record<string, string>, zh: zhLocale.ui as Record<string, string> }
const h: any = React.createElement
const { useState, useRef, useEffect, useLayoutEffect, useCallback } = React as any;

/** Locale key lookup supplied by the Host locale service. */
type Translate = (key: string) => string

interface FieldProps {
  label?: any
  value?: any
  onChange: (value: any) => void
  hint?: any
  [key: string]: any
}

interface NoticeProps {
  message?: any
  retry?: any
  t: Translate
  warning?: boolean
}

interface CardInspectorProps {
  id: string
  label: string
  anchorRef: React.RefObject<any>
  fallbackRef: React.RefObject<any>
  onClose: () => void
  t: Translate
  children?: any
}

interface PopupMenuProps {
  id: string
  label: string
  value?: any
  icon?: any
  activeId: string
  setActiveId: React.Dispatch<React.SetStateAction<string>>
  disabled?: boolean
  panelMode?: boolean
  className?: string
  children: (close: (type?: string) => void) => any
}

interface WifiDialogProps {
  t: Translate
  host: string
  port: string
  setHost: (value: string) => void
  setPort: (value: string) => void
  onClose: () => void
  onConnect: () => void
  disabled: boolean
}

interface SyncDialogProps {
  t: Translate
  module?: string
  onClose: () => void
  onSync: () => void
}

interface ArtifactCardProps {
  item: ArtifactRow
  t: Translate
  onSign: (item: ArtifactRow) => void
  disabled: boolean
}

interface SessionWorkbenchProps {
  sessionId: string
  t: Translate
}

interface ProjectWorkbenchProps {
  sessionId: string
  project: Project & { root: string }
  projectError: string
  projectBusy: boolean
  request: (args: any, signal?: AbortSignal) => Promise<any>
  validateProject: (root: string, signal?: AbortSignal) => Promise<any>
  refreshProject: (force?: boolean, signal?: AbortSignal) => Promise<any>
  t: Translate
}

interface TasksBodyProps {
  sessionId: string
  t: Translate
  cancelJob: (jobId: string) => Promise<any>
}

interface SessionToolbarProps {
  sessionId: string
  t: Translate
}

interface WorkbenchContext {
  effect: (factory: () => (() => void) | void, label?: string) => void
  locale: {
    register: (namespace: string, language: string, dictionary: Record<string, string>) => () => void
    bind: (namespace: string) => Translate
  }
  sidebarRight?: { openTab?: (tab: string) => unknown }
  sidebarRightTabs?: {
    register: (definition: { id: string; kind: string; priority: string; title: () => string }) => () => void
  }
  slots: {
    inject: (key: string, callback: () => (() => void) | void) => void
    register: (options: Record<string, any>, component: (props: any) => any) => () => void
  }
}
    const running = (job: Partial<Job> | null | undefined): boolean => !!job && UI_RUNNING.includes(job.status as string);
    const LONG_ACTIONS = new Set(['run', 'build', 'package', 'sign', 'sync']);
    const GUARDED = new Set(['devices', 'run', 'build', 'package', 'sign', 'install', 'stop', 'uninstall', 'connect', 'disconnect', 'pair', 'logcat', 'artifacts']);
    const MUTATIONS = new Set(['run', 'build', 'package', 'sign', 'install', 'stop', 'uninstall', 'connect', 'disconnect', 'pair']);
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const basename = (value: unknown): string => String(value || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
    const aborted = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const blankFrame = (job?: Job | null): JobFrame => ({ job: job || null, output: '', cursor: 0, result: null, lossy: false });
    const CSS = `
.awb2-shell{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;line-height:1.5;isolation:isolate}
.awb2-shell *{box-sizing:border-box}.awb2-shell button,.awb2-shell input,.awb2-shell select,.awb2-shell summary{font:inherit}.awb2-shell button,.awb2-shell summary{cursor:pointer}.awb2-shell button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:5px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);white-space:nowrap}.awb2-shell button:hover:not(:disabled),.awb2-shell summary:hover{background:var(--dsw-alias-bg-layer-2)}.awb2-shell :disabled{opacity:.45;cursor:not-allowed}.awb2-shell button:focus-visible,.awb2-shell summary:focus-visible,.awb2-shell input:focus-visible,.awb2-shell select:focus-visible,.awb2-shell pre:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.awb2-shell input:not([type=checkbox]):not([type=radio]),.awb2-shell select{min-height:32px;min-width:0;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}.awb2-shell input::placeholder{color:var(--dsw-alias-label-secondary)}.awb2-shell input[type=checkbox],.awb2-shell input[type=radio]{accent-color:var(--dsw-alias-brand-primary)}
.awb2-projectbar{display:flex;align-items:center;gap:10px;min-height:43px;flex:none;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.awb2-projectmark{color:var(--dsw-alias-brand-primary);display:flex;flex:none}.awb2-projectname{font-weight:600;line-height:1.25}.awb2-projectpath{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11px;line-height:1.3;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.awb2-projecttext{flex:1;min-width:0}.awb2-subtle{color:var(--dsw-alias-label-secondary);font-size:12px}.awb2-back{border:0!important;background:none!important;font-size:12px!important}.awb2-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}.awb2-toolbarlabel{display:flex;align-items:center;gap:7px;min-width:0}.awb2-toolbarlabel>span{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}.awb2-appselect{width:180px;max-width:28vw}.awb2-deviceselect{width:240px;max-width:30vw}.awb2-iconbutton{width:30px;min-width:30px;padding:4px!important}.awb2-run{color:var(--dsw-alias-state-success-primary)!important;font-weight:600!important}.awb2-cancel{color:var(--dsw-alias-state-error-primary)!important}.awb2-divider{height:24px;width:1px;flex:none;background:var(--dsw-alias-border-l1);margin:0 2px}.awb2-buildgroup{display:flex;align-items:stretch;gap:0;margin-left:auto}.awb2-buildgroup>button{border-radius:6px 0 0 6px}.awb2-buildmenu{position:relative}.awb2-buildmenu>summary{list-style:none;display:flex;align-items:center;justify-content:center;min-height:32px;min-width:30px;border:1px solid var(--dsw-alias-border-l1);border-left:0;border-radius:0 6px 6px 0;background:var(--dsw-alias-bg-base)}.awb2-buildmenu>summary::-webkit-details-marker{display:none}.awb2-menuitems{position:absolute;right:0;top:calc(100% + 5px);z-index:8;min-width:270px;padding:5px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-overlay);display:flex;flex-direction:column;gap:2px}.awb2-menuitems button{justify-content:flex-start;border:0;text-align:left;background:none;white-space:normal}.awb2-menuitems .awb2-menuseparator{height:1px;background:var(--dsw-alias-border-l1);margin:4px}
.awb2-variantbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:7px 16px;min-height:40px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;font-size:12px}.awb2-variantbar select{max-width:min(440px,55vw);min-height:28px!important;font-size:12px!important}.awb2-advanced{position:relative;margin-left:auto}.awb2-advanced>summary{color:var(--dsw-alias-label-secondary);padding:4px}.awb2-advancedbody{position:absolute;top:calc(100% + 5px);right:0;z-index:7;width:min(400px,80vw);padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-overlay)}.awb2-check{display:flex;align-items:flex-start;gap:8px;font-size:12px}.awb2-check input{margin-top:3px}.awb2-check small{display:block;color:var(--dsw-alias-label-secondary);margin-top:3px}.awb2-banner{padding:7px 16px;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-state-warn-primary);flex:none}
.awb2-workspace{display:flex;min-height:150px;flex:1;overflow:hidden}.awb2-editor{flex:1;min-width:0;overflow:auto;padding:22px 24px 30px}.awb2-overview{max-width:850px;margin:0 auto}.awb2-overview h1,.awb2-wizard h1{font-size:18px;line-height:1.4;font-weight:600;margin:0 0 7px}.awb2-overview p,.awb2-wizard p{margin:7px 0}.awb2-config{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 16px}.awb2-config>div{min-width:0;padding:13px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}.awb2-config dt,.awb2-review dt{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 5px}.awb2-config dd{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,monospace);font-size:12px;line-height:1.5;margin:0;overflow-wrap:anywhere}.awb2-ready{color:var(--dsw-alias-state-success-primary);font-size:12px;display:flex;align-items:center;gap:6px}.awb2-blocked{color:var(--dsw-alias-state-warn-primary);font-size:12px}.awb2-help{border-top:1px solid var(--dsw-alias-border-l1);padding-top:16px;margin-top:22px}.awb2-help h2{font-size:13px;margin:0 0 8px}.awb2-help ol{padding-left:20px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}.awb2-help li{margin:6px 0}.awb2-projectinfo{margin-top:22px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:13px;font-size:12px}.awb2-projectinfo>summary{color:var(--dsw-alias-label-secondary)}.awb2-projectinfo ul{padding-left:18px}.awb2-projectinfo li{color:var(--dsw-alias-state-warn-primary);margin:7px 0;overflow-wrap:anywhere}.awb2-projectinfo p{overflow-wrap:anywhere}.awb2-notice{padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;margin:10px 0;display:flex;align-items:center;gap:10px;font-size:12px;overflow-wrap:anywhere}.awb2-notice>span{flex:1;min-width:0}.awb2-error{color:var(--dsw-alias-state-error-primary)}.awb2-warning{color:var(--dsw-alias-state-warn-primary)}.awb2-success{color:var(--dsw-alias-state-success-primary)}.awb2-row{display:flex;align-items:flex-end;flex-wrap:wrap;gap:9px;margin-top:12px}.awb2-field{display:flex;flex:1 1 200px;flex-direction:column;gap:5px;min-width:0}.awb2-field>span{font-size:12px;font-weight:500}.awb2-field input,.awb2-field select{width:100%}.awb2-field small{font-size:11px;color:var(--dsw-alias-label-secondary)}.awb2-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:14px;margin-top:17px}.awb2-muted{color:var(--dsw-alias-label-secondary);font-size:12px}.awb2-target{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11px;line-height:1.6;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);margin-top:8px}
.awb2-devicespanel{flex:0 0 318px;width:318px;max-width:42%;padding:15px 16px 26px;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:auto}.awb2-panelhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.awb2-panelhead h2{font-size:13px;margin:0}.awb2-devicelist{display:flex;flex-direction:column;gap:5px;margin:12px 0}.awb2-devicerow{width:100%;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;padding:10px!important;border:1px solid var(--dsw-alias-border-l1)!important;border-radius:7px!important;text-align:left;white-space:normal!important;background:var(--dsw-alias-bg-base)!important}.awb2-devicerow[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)!important;background:var(--dsw-alias-bg-layer-2)!important}.awb2-devicetext{flex:1;min-width:0}.awb2-devicetext strong{display:block;font-size:12px}.awb2-devicetext code{display:block;font-size:10px;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}.awb2-devicecaption{font-size:11px;margin-top:2px}.awb2-devicefold{padding-top:12px;margin-top:14px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}.awb2-devicefold>summary{font-weight:500}.awb2-devicefold p{font-size:11px;color:var(--dsw-alias-label-secondary);margin:10px 0}.awb2-devicefold .awb2-field{flex-basis:100%}.awb2-inlineconfirmation{padding:10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:6px;margin-top:12px}.awb2-inlineconfirmation p{color:var(--dsw-alias-state-error-primary)}
.awb2-wizard{max-width:850px;margin:0 auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:20px}.awb2-wizardhead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.awb2-steps{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:19px 0 22px;border-bottom:1px solid var(--dsw-alias-border-l1)}.awb2-steps li{color:var(--dsw-alias-label-secondary);font-size:12px;padding:0 9px 10px;border-bottom:2px solid var(--dsw-alias-border-l1)}.awb2-steps li[aria-current=step]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}.awb2-wizardbody{min-height:170px}.awb2-wizardactions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:22px;padding-top:15px;border-top:1px solid var(--dsw-alias-border-l1)}.awb2-primary{border-color:var(--dsw-alias-brand-primary)!important;color:var(--dsw-alias-brand-primary)!important;font-weight:600!important}.awb2-radios{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px}.awb2-radios label{display:flex;align-items:center;gap:7px;font-size:12px}.awb2-review{display:grid;grid-template-columns:140px minmax(0,1fr);gap:9px 15px;margin:18px 0}.awb2-review dt{margin:0}.awb2-review dd{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,monospace);font-size:12px;line-height:1.5;margin:0;overflow-wrap:anywhere}.awb2-wizardadvanced{margin-top:16px;font-size:12px}.awb2-wizardadvanced>summary{color:var(--dsw-alias-label-secondary)}
.awb2-tools{flex:0 0 34%;height:34%;min-height:188px;max-height:48%;display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);overflow:hidden}.awb2-toolheader{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:0 14px;min-height:39px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}.awb2-tabs{display:flex;align-items:stretch;align-self:stretch;gap:2px}.awb2-tabs>button{border:0;border-radius:0;background:none;padding:8px 10px;font-size:12px;border-bottom:2px solid var(--dsw-alias-border-l1)}.awb2-tabs>button[aria-selected=true]{border-bottom-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}.awb2-history{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}.awb2-history select{max-width:270px;min-height:27px!important;font-size:11px!important}.awb2-history>span{font-size:11px;color:var(--dsw-alias-label-secondary)}.awb2-toolbody{min-height:0;flex:1;overflow:auto;padding:10px 16px 16px}.awb2-tasksummary{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:11px;margin-bottom:8px;color:var(--dsw-alias-label-secondary)}.awb2-tasksummary strong{font-size:12px;color:var(--dsw-alias-label-primary)}.awb2-tasksummary code{font-size:10px;overflow-wrap:anywhere}.awb2-progress{color:var(--dsw-alias-brand-primary);font-size:11px;margin-bottom:7px}.awb2-log{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:3px 0;min-height:36px;color:var(--dsw-alias-label-primary)}.awb2-toolplaceholder{color:var(--dsw-alias-label-secondary);font-size:12px;margin:10px 0}.awb2-logcatcontrols{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.awb2-logcatcontrols code{font-size:11px;color:var(--dsw-alias-label-secondary)}.awb2-artifactlist{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(390px,100%),1fr));gap:9px;margin-top:9px}.awb2-artifact{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:11px 12px;background:var(--dsw-alias-bg-layer-1);min-width:0}.awb2-artifacthead{display:flex;align-items:center;gap:8px;margin-bottom:7px}.awb2-artifacthead strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.awb2-format{font-size:10px;padding:2px 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;flex:none}.awb2-artifactpath{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,monospace);font-size:10px;line-height:1.5;overflow-wrap:anywhere;user-select:text}.awb2-artifactmeta{display:flex;align-items:center;flex-wrap:wrap;gap:5px 12px;color:var(--dsw-alias-label-secondary);font-size:10px;margin-top:8px}.awb2-artifactactions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.awb2-artifactactions button{min-height:25px;font-size:11px;padding:3px 7px}.awb2-empty{display:flex;flex:1;align-items:center;justify-content:center;padding:30px}.awb2-empty>div{max-width:480px}.awb2-empty h1{font-size:18px}.awb2-header-button{appearance:none;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);display:inline-flex;align-items:center;gap:5px;font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:12px;line-height:1.4;padding:4px 8px;cursor:pointer}.awb2-header-button:hover{background:var(--dsw-alias-bg-layer-2)}.awb2-header-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
@media(max-width:800px){.awb2-toolbar{padding:8px 12px;gap:6px}.awb2-appselect{width:150px;max-width:35vw}.awb2-deviceselect{width:190px;max-width:40vw}.awb2-toolbarlabel>span{display:none}.awb2-devicespanel{flex-basis:280px;width:280px;max-width:48%}.awb2-editor{padding:17px 16px 24px}.awb2-config{grid-template-columns:1fr}.awb2-config>div{padding:9px 11px}.awb2-tools{flex-basis:37%;height:37%;max-height:48%}.awb2-history{margin-left:0}.awb2-history>span{display:none}.awb2-history select{max-width:210px}.awb2-wizard{padding:15px}.awb2-review{grid-template-columns:110px minmax(0,1fr)}}
@media(max-width:560px){.awb2-workspace{overflow:auto;display:block}.awb2-editor{overflow:visible}.awb2-devicespanel{width:auto;max-width:none;border-left:0;border-top:1px solid var(--dsw-alias-border-l1);overflow:visible}.awb2-buildgroup{margin-left:0}.awb2-toolbar .awb2-divider{display:none}.awb2-toolbarlabel{flex:1;min-width:42%}.awb2-toolbarlabel select{width:100%;max-width:none}.awb2-variantbar{gap:6px;padding:6px 12px}.awb2-variantbar select{max-width:65vw}.awb2-advanced{margin-left:0}.awb2-advancedbody{left:0;right:auto}.awb2-tools{min-height:205px;flex-basis:36%;height:36%}.awb2-toolheader{padding:0 7px;gap:4px}.awb2-tabs>button{padding:8px;font-size:11px}.awb2-toolbody{padding:9px 11px 14px}.awb2-review{grid-template-columns:1fr;gap:3px}.awb2-review dd{margin-bottom:8px}}
`;

    function Icon({ size = 20, active = false }: { size?: number; active?: boolean }): any {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: active ? 1.9 : 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false }, h('rect', { x: 4, y: 2.5, width: 12.5, height: 19, rx: 3 }), h('path', { d: 'M8 5h4.5M9 18.5h2.5M9 9l4 2.5L9 14zM19.5 5.5v9m-2-7 2-2 2 2m-2 3h2v3h-2m0 1v3' }));
    }
    function SymbolIcon({ kind, size = 15 }: { kind: string; size?: number }): any {
      const paths: Record<string, string> = { tasks: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', settings: 'M4 7h16M4 17h16M8 4v6m8 4v6', play: 'M7 4l13 8L7 20Z', stop: 'M5 5h14v14H5Z', refresh: 'M20 7v5h-5M4 17v-5h5M6.5 7a7 7 0 0 1 11.8-1L20 9M4 15l1.7 3A7 7 0 0 0 17.5 17', chevron: 'm6 9 6 6 6-6', close: 'm6 6 12 12M18 6 6 18', wifi: 'M2.5 8.5a15 15 0 0 1 19 0M6 12.5a10 10 0 0 1 12 0M9.5 16.5a5 5 0 0 1 5 0M12 20h.01', plus: 'M12 5v14M5 12h14', build: 'm14 4 6 6-2 2-3-3-6 6 1 1-5 5-3-3 5-5 1 1 6-6-3-3Z', check: 'm5 12 4 4L19 6' };
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: kind === 'play' || kind === 'stop' ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[kind] || paths.build }));
    }
    function Field({ label, value, onChange, hint, ...props }: FieldProps): any {
      return h('label', { className: 'awb2-field' }, h('span', null, label), h('input', { ...props, value: value || '', onChange: (event: any) => onChange(event.target.value), autoComplete: 'off', spellCheck: false }), hint && h('small', null, hint));
    }
    function SecretField({ label, ...props }: { label?: any; [key: string]: any }): any {
      return h('label', { className: 'awb2-field' }, h('span', null, label), h('input', { type: 'password', autoComplete: 'new-password', ...props }));
    }
    function SelectField({ label, children, ...props }: { label?: any; children?: any; [key: string]: any }): any {
      return h('label', { className: 'awb2-field' }, h('span', null, label), h('select', props, children));
    }
    function Notice({ message, retry, t, warning = false }: NoticeProps): any {
      return message ? h('div', { className: 'awb2-notice ' + (warning ? 'awb2-warning' : 'awb2-error'), role: 'alert' }, h('span', null, message), retry && h('button', { type: 'button', onClick: retry }, t('retry'))) : null;
    }
    function statusText(job: Job | null | undefined, t: Translate) { return t(Object.prototype.hasOwnProperty.call(LOCALES.en, 'status.' + job?.status) ? 'status.' + job!.status : 'status.unknown'); }
    function deviceText(device: Device | null | undefined, t: Translate) { return t(Object.prototype.hasOwnProperty.call(LOCALES.en, 'state.' + device?.state) ? 'state.' + device!.state : 'state.unknown'); }
    function jobTitle(job: Job | null | undefined, t: Translate) { const action = job?.context?.action; return (action && LOCALES.en['action.' + action] ? t('action.' + action) : t('job')) + (job?.context?.module ? ' · ' + job.context.module : ''); }
    function sizeText(value: unknown, t: Translate) {
      if (!Number.isFinite(value)) return t('size.unknown');
      const units = ['unit.bytes', 'unit.kib', 'unit.mib', 'unit.gib'];
      let amount = value as number; let unit = 0;
      while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
      return String(Math.round(amount * 10) / 10) + ' ' + t(units[unit] as string);
    }
    const POPUP_CSS = `
.awb2-popup-anchor{position:relative;display:inline-flex;min-width:0}.awb2-popup-trigger{justify-content:space-between!important;min-width:100px;max-width:240px}.awb2-popup-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.awb2-popup-trigger[aria-expanded=true]{border-color:var(--dsw-alias-brand-primary)}.awb2-popup{position:fixed;z-index:80;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);padding:6px;box-shadow:var(--dsw-elevation-panel,0 5px 20px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent))}.awb2-popup-title{padding:6px 9px;font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:600}.awb2-popup-option{display:flex!important;align-items:center!important;justify-content:flex-start!important;text-align:left;white-space:normal!important;width:100%;border:0!important;background:none!important;padding:9px!important;gap:9px!important}.awb2-popup-option:hover:not(:disabled),.awb2-popup-option:focus-visible{background:var(--dsw-alias-bg-layer-2)!important}.awb2-popup-option[aria-checked=true]{color:var(--dsw-alias-brand-primary)}.awb2-popup-option .awb2-optiontext{min-width:0;flex:1;overflow-wrap:anywhere}.awb2-popup-option strong{display:block;font-size:12px;font-weight:500}.awb2-popup-option small{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}.awb2-popup-check{width:15px;flex:none}.awb2-popup-separator{height:1px;background:var(--dsw-alias-border-l1);margin:5px}.awb2-popup-footnote{font-size:11px;color:var(--dsw-alias-label-secondary);padding:5px 9px}.awb2-appmenu{width:180px;max-width:28vw}.awb2-devicemenu{width:240px;max-width:30vw}@media(max-width:800px){.awb2-appmenu{width:150px;max-width:35vw}.awb2-devicemenu{width:190px;max-width:40vw}}@media(max-width:560px){.awb2-appmenu,.awb2-devicemenu{width:100%;max-width:none}}
.awb2-panel{width:340px;max-width:calc(100vw - 20px);padding:11px}.awb2-panelhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:12px;margin-bottom:9px}.awb2-panelhead>span{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.awb2-fieldrow{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:center;gap:9px;margin-bottom:8px}.awb2-fieldrow>span{font-size:11px;color:var(--dsw-alias-label-secondary)}.awb2-fieldrow select{min-height:29px;font-size:12px;width:100%}.awb2-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;overflow:hidden}.awb2-seg>button{min-height:29px;padding:3px 14px;border:0;border-radius:0;background:none;font-size:12px}.awb2-seg>button+button{border-left:1px solid var(--dsw-alias-border-l1)}.awb2-seg>button[aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary)}.awb2-panelprimary{width:100%;min-height:32px;justify-content:center;margin-top:2px;font-weight:600;background:var(--dsw-alias-brand-primary)!important;border-color:var(--dsw-alias-brand-primary)!important;color:var(--dsw-alias-bg-base)!important}.awb2-panellink{display:flex!important;justify-content:flex-start!important;width:100%;border:0!important;background:none!important;padding:7px 4px!important;font-size:12px!important;color:var(--dsw-alias-brand-primary)!important}.awb2-panellink:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)!important}.awb2-paneltitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:2px 0 7px}.awb2-fieldrow input{width:100%;min-height:29px;font-size:12px;padding:3px 7px}.awb2-envnames{font-size:10px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.awb2-panelprimary.awb2-panelsign{background:var(--dsw-alias-bg-base)!important;border-color:var(--dsw-alias-brand-primary)!important;color:var(--dsw-alias-brand-primary)!important;margin-top:6px}.awb2-wifi{margin-top:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:11px 12px;background:var(--dsw-alias-bg-layer-1)}.awb2-wifihead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;font-size:13px}.awb2-wifiheadactions{display:flex;align-items:center;gap:4px}.awb2-devicerow{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 8px;background:var(--dsw-alias-bg-base)}.awb2-devicerow[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)}.awb2-devicepick{flex:1;min-width:0;justify-content:flex-start!important;text-align:left;border:0!important;background:none!important;padding:3px 2px!important}.awb2-wifiaction{min-height:30px;font-size:12px}.awb2-backdrop{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}.awb2-dialog{width:min(400px,calc(100vw - 24px));border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent,0 10px 34px color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent));padding:12px;display:flex;flex-direction:column;gap:10px}.awb2-dialoghead{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px}.awb2-dialogrow{display:flex;align-items:center;gap:7px}.awb2-dialogrow input:first-child{flex:1;min-width:0}.awb2-dialogrow input:nth-child(2){width:72px;flex:none;text-align:center}.awb2-dialogrow input{min-height:31px;font-size:12px}.awb2-dialogrow button{min-height:31px}.awb2-dialogactions{display:flex;justify-content:flex-end;gap:7px}.awb2-dialogactions button{min-height:31px}.awb2-wifisection{margin-top:12px}.awb2-wifititle{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:6px}.awb2-wifilist{display:flex;flex-direction:column;gap:6px}.awb2-wifidevice{display:flex;align-items:center;gap:9px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base)}.awb2-wifitext{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.awb2-wifitext strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.awb2-wifitext code{font-size:10px;color:var(--dsw-alias-label-secondary)}.awb2-wifidevice .awb2-wifi{color:var(--dsw-alias-brand-primary)}.awb2-panelcheck{margin:2px 0 4px;font-size:11px}.awb2-panelcheck>span{display:flex;flex-direction:column;gap:1px}`;
    const SIDE_CSS = `
.awb2-side{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:12px;line-height:1.5}
.awb2-side *{box-sizing:border-box}.awb2-side button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:6px;min-height:26px;padding:2px 8px;font:inherit;cursor:pointer}.awb2-side button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}.awb2-side button:disabled{opacity:.45;cursor:not-allowed}
.awb2-sidehead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.awb2-side .awb2-iconbutton{width:26px;min-width:26px;padding:2px}
.awb2-sidelist{display:flex;flex-direction:column;gap:4px;padding:8px;overflow:auto;flex:none;max-height:46%}
.awb2-sidejob{width:100%;justify-content:space-between!important;text-align:left;padding:6px 8px!important}
.awb2-sidejob[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.awb2-sidejobtitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.awb2-sidejobstate{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary)}
.awb2-sidebody{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
.awb2-sidebody .awb2-tasksummary{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}
.awb2-sidebody .awb2-log{flex:1;min-height:0;overflow:auto;margin:0;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.awb2-side .awb2-muted{color:var(--dsw-alias-label-secondary);padding:8px 10px;margin:0}
.awb2-side .awb2-error{color:var(--dsw-alias-state-error-primary)}
`;
    const CARD_CSS = `
.awb2-shell.awb2-card{height:auto;min-height:30px;min-width:0;max-width:100%;overflow:visible;display:inline-flex;flex:1 1 auto;justify-content:flex-end;margin-left:auto;vertical-align:middle;background:none;isolation:auto;font-size:12px}.awb2-card>.awb2-toolbar{padding:0;gap:4px;min-height:30px;max-width:100%;border:0;background:none;justify-content:flex-end;margin-left:auto}.awb2-card>.awb2-toolbar>.awb2-toolbarlabel{flex:none;min-width:0}.awb2-card>.awb2-toolbar button{min-height:28px;padding:3px 6px;gap:4px;font-size:12px}.awb2-card .awb2-appmenu{width:100px;max-width:100px;min-width:0}.awb2-card .awb2-devicemenu{width:120px;max-width:120px;min-width:0}.awb2-card .awb2-buildtrigger{width:65px;min-width:0;max-width:65px}.awb2-card .awb2-iconbutton{width:28px;min-width:28px}.awb2-cardstatus{font-size:10px;max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}.awb2-cardstatus.awb2-error{color:var(--dsw-alias-state-error-primary)}.awb2-cardstatus.awb2-warning{color:var(--dsw-alias-state-warn-primary)}
.awb2-popup[popover],.awb2-inspector[popover]{margin:0;inset:auto;box-sizing:border-box}.awb2-inspector{position:fixed;z-index:81;display:flex;flex-direction:column;overflow:hidden;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,0 5px 20px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent));font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;line-height:1.5}.awb2-inspector[popover]:not(:popover-open){display:none}.awb2-inspectorhead{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}.awb2-inspectorhead strong{flex:1;min-width:0;font-size:13px}.awb2-inspectorbody{overflow:auto;min-height:0;padding:12px}.awb2-inspector .awb2-devicespanel{width:100%;max-width:none;padding:0;border:0;background:none;overflow:visible}.awb2-inspector .awb2-tools{height:auto;max-height:none;min-height:180px;border:0;overflow:visible}.awb2-inspector .awb2-toolbody{overflow:visible;padding:10px 0 0}.awb2-inspector .awb2-toolheader{padding:0;gap:5px}.awb2-inspector .awb2-history{margin-left:0}.awb2-inspector .awb2-history select{max-width:230px}.awb2-inspector .awb2-wizard{padding:0;max-width:none;border:0;background:none}.awb2-inspector .awb2-wizardbody{min-height:0}.awb2-inspector .awb2-wizard h1{font-size:15px}.awb2-inspector .awb2-config{margin:12px 0}.awb2-inspector .awb2-projectinfo{margin-top:12px}.awb2-popup-variant{padding:7px 9px;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
`;
    // Own fixed layers use the viewport, never the 30px card header's bounds.
    function floatingPosition(element: Element, preferredWidth: number, preferredHeight: number): PopupPosition {
      return popupGeometry(element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, preferredWidth, preferredHeight);
    }
    function showOwnedPopover(element: HTMLElement | null | undefined): () => void {
      // Native top-layer panels remain React descendants and escape clipping headers.
      if (typeof element?.showPopover !== 'function') {
        element?.removeAttribute('popover');
        return () => {};
      }
      try { if (!element.matches(':popover-open')) element.showPopover(); }
      catch (_) { element.removeAttribute('popover'); return () => {}; }
      return () => { if (element.matches(':popover-open')) element.hidePopover(); };
    }
    function CardInspector({ id, label, anchorRef, fallbackRef, onClose, t, children }: CardInspectorProps): any {
      const panel = useRef(null);
      const [position, setPosition] = useState(null);
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      const positioned = position !== null;
      useEffect(() => { if (positioned) panel.current?.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)')?.focus(); }, [positioned]);
      useLayoutEffect(() => {
        const element = panel.current;
        const origin = anchorRef.current?.isConnected ? anchorRef.current : document.activeElement;
        const locate = () => { const anchor = anchorRef.current?.isConnected ? anchorRef.current : fallbackRef.current; if (anchor) setPosition(floatingPosition(anchor, 680, 560)); };
        const close = (restore: any) => { closeRef.current(); if (restore && origin?.isConnected) origin.focus?.(); };
        const outside = (event: any) => { if (!element.contains(event.target) && !fallbackRef.current?.contains(event.target)) close(false); };
        const escape = (event: any) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } };
        locate();
        const hide = showOwnedPopover(element);
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape, true);
        window.addEventListener('resize', locate);
        window.addEventListener('scroll', locate, true);
        return () => { hide(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('resize', locate); window.removeEventListener('scroll', locate, true); if (element.contains(document.activeElement) && origin?.isConnected) origin.focus?.(); };
      }, [anchorRef, fallbackRef]);
      return h('section', { ref: panel, id, popover: 'manual', role: 'dialog', 'aria-modal': false, 'aria-label': label, className: 'awb2-inspector', style: position || { visibility: 'hidden' } },
        h('div', { className: 'awb2-inspectorhead' }, h('strong', null, label), h('button', { type: 'button', className: 'awb2-iconbutton', onClick: onClose, title: t('close'), 'aria-label': t('close') }, h(SymbolIcon, { kind: 'close' }))),
        h('div', { className: 'awb2-inspectorbody' }, children));
    }
    function PopupMenu({ id, label, value, icon, activeId, setActiveId, disabled = false, panelMode = false, className = '', children }: PopupMenuProps): any {
      const [state, dispatch] = React.useReducer(menuReducer, MENU_INITIAL);
      const [position, setPosition] = useState(null);
      const anchor = useRef(null), trigger = useRef(null), panel = useRef(null);
      const focusOnOpen = useRef(false);
      const isOpen = state.open && activeId === id && !disabled;
      const locate = useCallback(() => {
        const element = trigger.current;
        if (element) setPosition(floatingPosition(element, 350, 420));
      }, []);
      const close = useCallback((type = 'choose') => {
        if (type === 'choose' || type === 'escape') trigger.current?.focus();
        dispatch({ type }); setActiveId((previous: any) => previous === id ? '' : previous);
      }, [id, setActiveId]);
      const open = useCallback(() => {
        if (disabled) return;
        locate(); setActiveId(id); dispatch({ type: 'click' });
      }, [disabled, locate, id, setActiveId]);
      useEffect(() => { if (disabled || (activeId && activeId !== id)) dispatch({ type: 'disable' }); }, [disabled, activeId, id]);
      useEffect(() => {
        if (!isOpen) return undefined;
        locate();
        const hide = showOwnedPopover(panel.current);
        const outside = (event: any) => { if (!anchor.current?.contains(event.target)) close('outside'); };
        const escape = (event: any) => { if (event.key === 'Escape') { event.preventDefault(); close('escape'); } };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape);
        window.addEventListener('resize', locate);
        window.addEventListener('scroll', locate, true);
        if (focusOnOpen.current) { focusOnOpen.current = false; panel.current?.querySelector(panelMode ? 'select:not(:disabled),button:not(:disabled)' : '[role^="menuitem"]:not(:disabled)')?.focus(); }
        return () => { hide(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); window.removeEventListener('resize', locate); window.removeEventListener('scroll', locate, true); };
      }, [isOpen, locate, close]);
      const keydown = (event: any) => {
        if (event.key === 'Escape') { event.preventDefault(); close('escape'); trigger.current?.focus(); return; }
        if (panelMode || event.key === 'Tab') return;
        const items = [...(panel.current?.querySelectorAll('[role^="menuitem"]:not(:disabled)') || [])];
        if (!items.length) return;
        let index = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') index = (index + 1) % items.length;
        else if (event.key === 'ArrowUp') index = (index + items.length - 1) % items.length;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = items.length - 1;
        else return;
        event.preventDefault(); items[index]?.focus();
      };
      return h('div', { ref: anchor, className: 'awb2-popup-anchor', onBlur: (event: any) => { if (!event.currentTarget.contains(event.relatedTarget)) close('blur'); } },
        h('button', { ref: trigger, type: 'button', className: 'awb2-popup-trigger ' + className, disabled, 'aria-label': label + (value ? ': ' + value : ''), 'aria-haspopup': 'menu', 'aria-expanded': isOpen, 'aria-controls': id, onClick: () => { if (isOpen) close('choose'); else open(); }, onKeyDown: (event: any) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); focusOnOpen.current = true; open(); } else if (event.key === 'Escape') { event.preventDefault(); close('escape'); } } }, icon, h('span', null, value || label), h(SymbolIcon, { kind: 'chevron', size: 12 })),
        isOpen && position && h('div', { ref: panel, id, popover: 'manual', role: panelMode ? 'dialog' : 'menu', 'aria-modal': false, className: 'awb2-popup' + (panelMode ? ' awb2-panel' : ''), style: position, 'aria-label': label, onKeyDown: keydown }, children(close)));
    }
    function WifiDialog({ t, host, port, setHost, setPort, onClose, onConnect, disabled }: WifiDialogProps): any {
      const box = useRef(null);
      useEffect(() => {
        const escape = (event: any) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', escape, true);
        const frame = requestAnimationFrame(() => box.current?.querySelector('input')?.focus());
        return () => { document.removeEventListener('keydown', escape, true); cancelAnimationFrame(frame); };
      }, [onClose]);
      const submit = (event: any) => { if (event.key === 'Enter') { event.preventDefault(); if (!disabled && host.trim()) onConnect(); } };
      return h('div', { className: 'awb2-backdrop', onClick: (event: any) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { ref: box, className: 'awb2-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('adbWifi') },
          h('div', { className: 'awb2-dialoghead' }, h('strong', null, t('adbWifi')), h('button', { type: 'button', className: 'awb2-iconbutton', onClick: onClose, 'aria-label': t('close'), title: t('close') }, h(SymbolIcon, { kind: 'close', size: 14 }))),
          h('div', { className: 'awb2-dialogrow' },
            h('input', { value: host, placeholder: '192.168.1.23', autoComplete: 'off', 'aria-label': t('deviceIp'), disabled, onChange: (event: any) => setHost(event.target.value), onKeyDown: submit }),
            h('input', { value: port, inputMode: 'numeric', maxLength: 5, 'aria-label': t('port'), disabled, onChange: (event: any) => setPort(event.target.value.replace(/[^0-9]/g, '').slice(0, 5)), onKeyDown: submit }),
            h('button', { type: 'button', className: 'awb2-primary', disabled: disabled || !host.trim(), onClick: onConnect }, t('connect'))),
          h('p', { className: 'awb2-popup-footnote' }, t('wifiDialogHint'))));
    }
    function SyncDialog({ t, module, onClose, onSync }: SyncDialogProps): any {
      const box = useRef(null);
      useEffect(() => {
        const escape = (event: any) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', escape, true);
        const frame = requestAnimationFrame(() => box.current?.querySelector('button')?.focus());
        return () => { document.removeEventListener('keydown', escape, true); cancelAnimationFrame(frame); };
      }, [onClose]);
      return h('div', { className: 'awb2-backdrop', onClick: (event: any) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { ref: box, className: 'awb2-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('syncProject') },
          h('div', { className: 'awb2-dialoghead' }, h('strong', null, t('syncProject')), h('button', { type: 'button', className: 'awb2-iconbutton', onClick: onClose, 'aria-label': t('close') }, h(SymbolIcon, { kind: 'close', size: 14 }))),
          h('p', { className: 'awb2-muted' }, t('syncHint')),
          module && h('p', { className: 'awb2-target' }, module),
          h('div', { className: 'awb2-dialogactions' }, h('button', { type: 'button', onClick: onClose }, t('cancelSync')), h('button', { type: 'button', className: 'awb2-primary', onClick: onSync }, t('startSync')))));
    }
    function ArtifactCard({ item, t, onSign, disabled }: ArtifactCardProps): any {
      const [copied, setCopied] = useState(false);
      const [copyError, setCopyError] = useState(false);
      const copy = async () => { try { await navigator.clipboard.writeText(item.path); setCopied(true); setCopyError(false); } catch (_) { setCopyError(true); } };
      return h('article', { className: 'awb2-artifact' },
        h('div', { className: 'awb2-artifacthead' }, h('span', { className: 'awb2-format' }, t('format.' + item.format)), h('strong', { title: item.path }, basename(item.path))),
        h('div', { className: 'awb2-artifactpath', 'aria-label': t('artifact.path') }, item.path),
        h('div', { className: 'awb2-artifactmeta' }, h('span', null, t('artifact.size') + ': ' + sizeText(item.size, t)), item.variant && h('span', null, t('artifact.variant') + ': ' + item.variant), h('span', { className: item.verified ? 'awb2-success' : '' }, t(item.verified ? 'artifact.verified' : 'artifact.notVerified')), !item.verified && h('span', null, t(item.fresh ? 'artifact.fresh' : item.reused ? 'artifact.reused' : 'artifact.historical'))),
        h('div', { className: 'awb2-artifactactions' }, h('button', { type: 'button', onClick: copy, 'aria-label': t('copy') + ': ' + item.path }, copied ? t('copied') : t('copy')), h('button', { type: 'button', onClick: () => onSign(item), disabled }, t('artifact.sign'))),
        copyError && h('div', { className: 'awb2-error awb2-muted', role: 'status' }, t('copyFailed')));
    }

export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']
export function apply(ctx: WorkbenchContext): void {
        ctx.effect(() => ctx.locale.register('androidWorkbench', 'zh', LOCALES.zh));
        ctx.effect(() => ctx.locale.register('androidWorkbench', 'en', LOCALES.en));
        // Non-secret selection state survives reloads; passwords never reach storage.
        const selectionCache = new Map();
        let openTasksTab = () => {};
        /** Bind the plugin's own namespace once for labels used outside component props. */
        const translate = ctx.locale.bind('androidWorkbench');
        /** Shared button helper for every component in this module. */
        const button = (text: any, onClick?: any, disabled?: any, props: any = {}) => h('button', { type: 'button', onClick, disabled, ...props }, text);
        const persistSelections = () => {
          try {
            const entries = [...selectionCache].slice(-SELECTION_STORAGE_LIMIT).map(([key, value]) => [key, sanitizeSelection(value)]);
            window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
          } catch (_) { /* private mode or quota: memory still works for this page */ }
        };
        try {
          const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Array.isArray(parsed.entries)) for (const entry of parsed.entries.slice(-SELECTION_STORAGE_LIMIT)) {
            if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].length > 512) continue;
            selectionCache.set(entry[0], sanitizeSelection(entry[1]));
          }
        } catch (_) { selectionCache.clear(); }

        function SessionWorkbench({ sessionId, t }: SessionWorkbenchProps): any {
          const [project, setProject] = useState(null);
          const [projectError, setProjectError] = useState('');
          const [projectBusy, setProjectBusy] = useState(false);
          const alive = useRef(true);
          const projectRef = useRef(null);
          const pending = useRef(new Set());
          const projectQueue = useRef(null);
          const request = useCallback(async (args: any, signal?: AbortSignal) => {
            if (!sessionId) throw new Error(t('noSession'));
            const controller: AbortController | null = signal ? null : new AbortController();
            const control = signal || controller!.signal;
            if (controller) pending.current.add(controller);
            try {
              control.throwIfAborted();
              // Both observations and explicit clicks stay out of the logged
              // slash-command lifecycle; mutations have a separate allowlisted route.
              const observing = OBSERVE_ACTIONS.has(args.action);
              const response = await fetch(observing ? OBSERVE_PATH : ACTION_PATH, { method: 'POST', headers: { 'content-type': 'application/json', [observing ? 'x-awb-observe' : 'x-awb-action']: '1' }, body: JSON.stringify({ sessionId, args }), signal: control });
              const payload = await response.json().catch(() => null);
              control.throwIfAborted();
              if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : t('operationFailed'));
              return payload.value;
            } finally { if (controller) pending.current.delete(controller); }
          }, [sessionId, t]);
          const refreshProject = useCallback((force: boolean = false, signal?: AbortSignal) => {
            if (projectQueue.current && !force) return projectQueue.current;
            const before = projectQueue.current || Promise.resolve();
            const next = before.catch(() => {}).then(async () => {
              if (!alive.current || signal?.aborted) throw aborted();
              const controller = new AbortController();
              const relay = () => controller.abort();
              signal?.addEventListener('abort', relay, { once: true });
              pending.current.add(controller); setProjectBusy(true);
              try {
                const value = await request({ action: 'project' }, controller.signal);
                if (!value || typeof value.root !== 'string' || !Array.isArray(value.modules)) throw new Error(t('unexpectedResponse'));
                if (!alive.current || controller.signal.aborted) throw aborted();
                projectRef.current = value; setProject(value); setProjectError('');
                return value;
              } catch (failure: any) {
                if (alive.current && failure.name !== 'AbortError') setProjectError(failure.message || t('operationFailed'));
                throw failure;
              } finally { pending.current.delete(controller); signal?.removeEventListener('abort', relay); if (alive.current) setProjectBusy(false); }
            });
            projectQueue.current = next;
            next.then(() => { if (projectQueue.current === next) projectQueue.current = null; }, () => { if (projectQueue.current === next) projectQueue.current = null; });
            return next;
          }, [request, t]);
          const validateProject = useCallback(async (root: string, signal?: AbortSignal) => {
            const fresh = await refreshProject(true, signal);
            if (fresh.root !== root) throw new Error(t('workspaceChanged'));
            return fresh;
          }, [refreshProject, t]);
          useEffect(() => {
            alive.current = true;
            let stopped = false; let timer: any;
            const refresh = () => { if (visible() && sessionId) refreshProject(false).catch(() => {}); };
            const tick = async () => { if (!stopped && visible() && sessionId) { try { await refreshProject(false); } catch (_) {} } if (!stopped) timer = setTimeout(tick, 8000); };
            if (sessionId) refreshProject(false).catch(() => {});
            timer = setTimeout(tick, 8000);
            document.addEventListener('visibilitychange', refresh);
            return () => { stopped = true; alive.current = false; clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); for (const controller of pending.current) controller.abort(); pending.current.clear(); };
          }, [sessionId, refreshProject]);
          // Do not mount the controller (and its ADB/job observers) for unrelated chats.
          // Unknown projects remain invisible during the initial static discovery too.
          if (!sessionId || !showSessionToolbar(project)) return null;
          return h(ProjectWorkbench, { key: sessionSelectionKey(sessionId, project.root), sessionId, project, projectError, projectBusy, request, validateProject, refreshProject, t });
        }

        function ProjectWorkbench({ sessionId, project, projectError, projectBusy, request, validateProject, refreshProject, t }: ProjectWorkbenchProps): any {
          const root = project.root;
          const cacheKey = sessionSelectionKey(sessionId, root);
          const remembered = selectionCache.get(cacheKey) || {};
          const [selection, setSelection] = useState(() => reconcileModule(project, remembered));
          const [serial, setSerial] = useState(remembered.serial || '');
          const [devices, setDevices] = useState([]);
          const [devicesBusy, setDevicesBusy] = useState(false);
          const [inspector, setInspector] = useState('');
          const inspectorAnchor = useRef(null);
          const toolbar = useRef(null);
          const [activePopup, setActivePopup] = useState('');
          const setPopup = useCallback((value: any) => { if (typeof value === 'string' && value) setInspector(''); setActivePopup(value); }, []);
          const [errors, setErrors] = useState({});
          const [busy, setBusy] = useState('');
          const [skipResource, setSkipResource] = useState(false);
          const [syncedVariants, setSyncedVariants] = useState({});
          const [syncOpen, setSyncOpen] = useState(false);
          const [syncNotice, setSyncNotice] = useState(null);
          const [toolTab, setToolTab] = useState('logcat');
          const [artifactFormat, setArtifactFormat] = useState('apk');
          const [artifacts, setArtifacts] = useState([]);
          const [jobs, setJobs] = useState([]);
          const [historyKnown, setHistoryKnown] = useState(false);
          const [jobsBusy, setJobsBusy] = useState(false);
          const [selectedJobId, setSelectedJobId] = useState('');
          const [frame, setFrame] = useState(() => blankFrame());
          const [pollEpoch, setPollEpoch] = useState(0);
          const [cancelling, setCancelling] = useState(false);
          const [wizard, setWizard] = useState(null);
          const [signing, setSigning] = useState({ keystore: remembered.keystore || '', alias: remembered.alias || '', storePassword: '', keyPassword: '' });
          const [keystores, setKeystores] = useState(Array.isArray(remembered.keystores) ? remembered.keystores : []);
          const [wizardStep, setWizardStep] = useState(0);
          const [wirelessHost, setWirelessHost] = useState('');
          const [wirelessPort, setWirelessPort] = useState('5555');
          const [wifiOpen, setWifiOpen] = useState(false);
          const [wirelessHistory, setWirelessHistory] = useState(Array.isArray(remembered.wireless) ? remembered.wireless : []);
          const [connectionOutput, setConnectionOutput] = useState('');
          const [logcat, setLogcat] = useState({ serial: '', output: '' });
          const alive = useRef(true);
          const pending = useRef(new Set());
          const selectionRef = useRef(selection);
          const serialRef = useRef(serial);
          const jobsRef = useRef([]);
          const selectedJobRef = useRef('');
          const activeJobRef = useRef(null);
          const frameRef = useRef(frame);
          const deviceRequest = useRef(null);
          const jobsRequest = useRef(null);
          const operationRef = useRef(false);
          const jobReceipt = useRef(null);
          const historyKnownRef = useRef(false);
          const lastWirelessAction = useRef({ action: 'connect', address: '' });
          const toolButtons = useRef({});
          const updateError = useCallback((key: string, message: string = '') => setErrors((previous: any) => ({ ...previous, [key]: message })), []);
          selectionRef.current = selection; serialRef.current = serial; frameRef.current = frame;
          const modules = project.modules || [];
          const module = modules.find((item: any) => item.path === selection.modulePath);
          const variants = Array.from(new Set([...(module?.variants || []), ...(syncedVariants[selection.modulePath] || []), ...(selection.variant ? [selection.variant] : [])]));
          const selectedDevice = devices.find((device: any) => device.serial === serial);
          const activeJob = jobs.find(running) || (running(frame.job) ? frame.job : null) || (running(jobReceipt.current) ? jobReceipt.current : null);
          activeJobRef.current = activeJob;
          const readyDevice = selectedDevice?.state === 'device';
          const syncing = busy === 'sync' || syncNotice?.kind === 'running';
          const locked = !!busy || syncing || !!activeJob || !historyKnown || !!projectError || !modules.length;
          const blockedReason = projectError ? 'noProject' : runBlockedReason({ project, ...selection, serial, devices, busy: !!busy || !historyKnown, job: activeJob });
          const buildError = wizardError({ mode: 'build', ...selection, format: artifactFormat }, project);
          const synced = syncedVariants[selection.modulePath] || [];
          const canBuild = !locked && !buildError;
          const selectedJob = frame.job;
          const signRequest = useCallback(async (args: any, credentials: any, signal?: AbortSignal) => {
            const controller: AbortController | null = signal ? null : new AbortController();
            const control = signal || controller!.signal;
            if (controller) pending.current.add(controller);
            try {
              control.throwIfAborted();
              const response = await fetch(SIGN_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'x-awb-observe': '1' }, body: JSON.stringify({ sessionId, args, credentials }), signal: control });
              const payload = await response.json().catch(() => null);
              control.throwIfAborted();
              if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : t('operationFailed'));
              return payload.value;
            } finally { if (controller) pending.current.delete(controller); }
          }, [sessionId, t]);
          const invoke = useCallback(async (args: any, signal?: AbortSignal) => {
            if (!alive.current || signal?.aborted) throw aborted();
            const { storePassword, keyPassword, ...rest } = args;
            const guard = GUARDED.has(rest.action) ? { ...rest, projectRoot: root } : rest;
            if (storePassword || keyPassword) return signRequest(guard, { storePassword: storePassword ?? '', keyPassword: keyPassword ?? '' }, signal);
            return request(guard, signal);
          }, [request, root, signRequest]);
          const tracked = useCallback(async (args: any, controller: AbortController = new AbortController()) => {
            pending.current.add(controller);
            try { return await invoke(args, controller.signal); }
            finally { pending.current.delete(controller); }
          }, [invoke]);
          // Preserve the signing target and recent keystores when App/variant/device changes.
          const remember = (next: any, nextSerial: any = serialRef.current) => {
            const previous = selectionCache.get(cacheKey) || {};
            selectionCache.set(cacheKey, { ...previous, modulePath: next.modulePath, variant: next.variant, variantsByModule: { ...next.variantsByModule }, serial: nextSerial });
            persistSelections();
          };
          const commitSelection = (next: any) => { selectionRef.current = next; setSelection(next); remember(next); };
          const changeModule = (value: any) => commitSelection(reconcileModule(project, { ...selectionRef.current, modulePath: value, variant: selectionRef.current.variantsByModule[value] || '' }));
          const changeVariant = (value: any) => { const next = { ...selectionRef.current, variant: value, variantsByModule: { ...selectionRef.current.variantsByModule, [selectionRef.current.modulePath]: value } }; commitSelection(next); };
          const changeDevice = (value: any) => { serialRef.current = value; setSerial(value); remember(selectionRef.current, value); };
          const addArtifacts = useCallback((value: any) => {
            const rows = artifactRows(value);
            if (rows.length) setArtifacts((previous: any) => { const all = new Map(previous.map((item: any) => [item.path, item])); for (const item of rows) all.set(item.path, item); return [...all.values()].slice(-64); });
          }, []);
          const showInspector = (kind: string, event?: any) => {
            const source = event?.currentTarget || document.activeElement;
            inspectorAnchor.current = toolbar.current?.contains(source) ? source : inspectorAnchor.current?.isConnected ? inspectorAnchor.current : toolbar.current?.querySelector('button:not(:disabled)');
            setActivePopup(''); setInspector(kind);
          };
          const chooseJob = useCallback((job: any, switchTab: boolean = true, reveal: boolean = true) => {
            if (!job) return;
            /* Build/run output lives in the right Sidebar; never reopen the card's tools panel. */
            if (reveal) openTasksTab();
            if (selectedJobRef.current !== job.id) { selectedJobRef.current = job.id; setSelectedJobId(job.id); const empty = blankFrame(job); frameRef.current = empty; setFrame(empty); }
            setCancelling(false); updateError('observe'); setPollEpoch((value: any) => value + 1);
          }, [updateError]);
          const refreshDevices = useCallback(() => {
            if (deviceRequest.current) return deviceRequest.current;
            const next = (async () => {
              if (!alive.current) return;
              setDevicesBusy(true);
              try {
                const value = await tracked({ action: 'devices' });
                if (!alive.current) return;
                if (!Array.isArray(value?.devices)) throw new Error(t('unexpectedResponse'));
                setDevices(value.devices); updateError('devices');
                const nextSerial = chooseDevice(value.devices, serialRef.current);
                serialRef.current = nextSerial; setSerial(nextSerial);
                const cached = selectionCache.get(cacheKey) || selectionRef.current;
                selectionCache.set(cacheKey, { ...cached, serial: nextSerial });
              } catch (failure: any) { if (alive.current && failure.name !== 'AbortError') updateError('devices', failure.message || t('operationFailed')); }
              finally { if (alive.current) setDevicesBusy(false); }
            })();
            deviceRequest.current = next;
            next.then(() => { if (deviceRequest.current === next) deviceRequest.current = null; }, () => { if (deviceRequest.current === next) deviceRequest.current = null; });
            return next;
          }, [tracked, cacheKey, t, updateError]);
          // Android Studio-style sync: Gradle configures the project and lists tasks,
          // which yields the real variant names. No assemble/bundle task is executed.
          const runSync = () => {
            setSyncOpen(false);
            setSyncNotice({ kind: 'running', text: t('syncing') });
            perform({ action: 'sync', module: selectionRef.current.modulePath }).then((value: any) => {
              if (!alive.current) return;
              if (!value?.jobId) setSyncNotice({ kind: 'error', text: t('syncFailed') });
            });
          };
          const refreshJobs = useCallback((recover: boolean = false) => {
            if (jobsRequest.current) return jobsRequest.current;
            const next = (async () => {
              if (!alive.current) return [];
              setJobsBusy(true);
              try {
                const value = await tracked({ action: 'jobs' });
                if (!Array.isArray(value?.jobs)) throw new Error(t('unexpectedResponse'));
                if (!alive.current) return [];
                let rows = value.jobs.filter((job: any) => job?.context?.root === root && typeof job.id === 'string').slice(0, 20);
                // A list request can begin before the selected task settles. Never
                // downgrade an already observed terminal task to stale running.
                const observed = frameRef.current.job;
                if (observed && !running(observed)) rows = rows.map((job: any) => job.id === observed.id && running(job) ? { ...job, ...observed, context: observed.context || job.context } : job);
                const receipt = jobReceipt.current;
                if (receipt && running(receipt) && !rows.some((job: any) => job.id === receipt.id)) rows = [receipt, ...rows].slice(0, 20);
                if (receipt && rows.some((job: any) => job.id === receipt.id && !running(job))) jobReceipt.current = null;
                jobsRef.current = rows; activeJobRef.current = rows.find(running) || null; setJobs(rows);
                historyKnownRef.current = true; setHistoryKnown(true); updateError('jobs');
                if (!selectedJobRef.current) chooseJob(rows.find(running) || rows[0], true, false);
                return rows;
              } catch (failure: any) { if (alive.current && failure.name !== 'AbortError') { updateError('jobs', failure.message || t('jobRestoreFailed')); if (!historyKnownRef.current) setHistoryKnown(false); } throw failure; }
              finally { if (alive.current) setJobsBusy(false); }
            })();
            jobsRequest.current = next;
            next.then(() => { if (jobsRequest.current === next) jobsRequest.current = null; }, () => { if (jobsRequest.current === next) jobsRequest.current = null; });
            return next;
          }, [tracked, root, t, updateError, chooseJob]);
          useEffect(() => { commitSelection(reconcileModule(project, selectionRef.current)); }, [project]);
          useEffect(() => {
            alive.current = true;
            let stopped = false; let timer: any;
            const recover = () => { if (!visible()) return; refreshDevices(); refreshJobs(true).catch(() => {}); };
            const tick = async () => { if (!stopped && visible()) await Promise.allSettled([refreshDevices(), refreshJobs(false)]); if (!stopped) timer = setTimeout(tick, 8000); };
            recover(); timer = setTimeout(tick, 8000); document.addEventListener('visibilitychange', recover);
            return () => { stopped = true; alive.current = false; clearTimeout(timer); document.removeEventListener('visibilitychange', recover); for (const controller of pending.current) controller.abort(); pending.current.clear(); };
          }, [refreshDevices, refreshJobs]);
          useEffect(() => {
            if (!selectedJobId) return undefined;
            let stopped = false; let timer: any; let controller: AbortController | undefined;
            const poll = async () => {
              if (stopped || !alive.current) return;
              if (!visible()) { timer = setTimeout(poll, 1200); return; }
              controller = new AbortController();
              try {
                const current = frameRef.current;
                const response = await tracked({ action: 'status', jobId: selectedJobId, from: current.job?.id === selectedJobId ? current.cursor : 0 }, controller);
                if (stopped || !alive.current || selectedJobRef.current !== selectedJobId) return;
                if (!response?.job || response.job.id !== selectedJobId) throw new Error(t('unexpectedResponse'));
                const merged = mergeJobFrame(frameRef.current, response);
                frameRef.current = merged; setFrame(merged); updateError('observe'); addArtifacts(merged.result);
                const rows = jobsRef.current.map((job: any) => job.id === selectedJobId ? { ...job, ...response.job } : job);
                jobsRef.current = rows; setJobs(rows); activeJobRef.current = rows.find(running) || null;
                if (jobReceipt.current?.id === selectedJobId) jobReceipt.current = running(response.job) ? { ...jobReceipt.current, ...response.job } : null;
                if (running(response.job)) timer = setTimeout(poll, 1200);
                else { setCancelling(false); refreshJobs(false).catch(() => {}); }
              } catch (failure: any) { if (!stopped && alive.current && failure.name !== 'AbortError') updateError('observe', failure.message || t('jobObserveFailed')); }
            };
            poll();
            return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
          }, [selectedJobId, pollEpoch, tracked, t, updateError, addArtifacts, refreshJobs]);

          const perform = async (args: any, accept?: any, errorKey: string = 'operation') => {
            if (operationRef.current || !alive.current) return null;
            if (MUTATIONS.has(args.action) && (activeJobRef.current || jobReceipt.current || !historyKnownRef.current)) { updateError(errorKey, t(!historyKnownRef.current ? 'jobRestoreFailed' : 'reason.busy')); return null; }
            operationRef.current = true; setBusy(args.action); updateError(errorKey);
            const controller = new AbortController(); pending.current.add(controller);
            try {
              await validateProject(root, controller.signal);
              if (!alive.current || controller.signal.aborted) throw aborted();
              if (LONG_ACTIONS.has(args.action)) {
                const latest = await refreshJobs(false);
                if (latest.some(running) || jobReceipt.current) throw new Error(t('reason.busy'));
              }
              if (!alive.current || controller.signal.aborted) throw aborted();
              const value = await invoke(args, controller.signal);
              if (!alive.current || controller.signal.aborted) return null;
              if (value?.jobId) {
                const receipt = { id: value.jobId, status: value.status || 'running', context: { root, action: args.action, module: args.module, variant: args.variant, format: args.format, serial: args.serial } };
                jobReceipt.current = receipt; activeJobRef.current = receipt;
                const rows = [receipt, ...jobsRef.current.filter((job: any) => job.id !== receipt.id)].slice(0, 20); jobsRef.current = rows; setJobs(rows); chooseJob(receipt); setWizard(null);
              } else if (accept) accept(value);
              return value;
            } catch (failure: any) { if (alive.current && failure.name !== 'AbortError') updateError(errorKey, failure.message || t('operationFailed')); return null; }
            finally { pending.current.delete(controller); operationRef.current = false; if (alive.current) setBusy(''); }
          };
          const cancelTask = async () => {
            const target = activeJobRef.current || (running(frameRef.current.job) ? frameRef.current.job : null);
            if (!target || operationRef.current) return;
            operationRef.current = true; setBusy('cancel'); setCancelling(true); updateError('operation'); chooseJob(target, false);
            try {
              await tracked({ action: 'cancel', jobId: target.id });
              if (alive.current) { const stopping = { ...target, status: 'stopping' }; activeJobRef.current = stopping; jobReceipt.current = stopping; jobsRef.current = jobsRef.current.map((job: any) => job.id === target.id ? stopping : job); setJobs(jobsRef.current); setPollEpoch((value: any) => value + 1); }
            } catch (failure: any) { if (alive.current && failure.name !== 'AbortError') { setCancelling(false); updateError('operation', failure.message || t('operationFailed')); } }
            finally { operationRef.current = false; if (alive.current) setBusy(''); }
          };
          const defaultOutput = (form: any): string => form.mode === 'existing' ? suggestSignedOutput(form.artifact) : root.replace(/[\\/]$/, '') + '/build/android-workbench/' + (basename(form.modulePath) || 'app').replace(/[^A-Za-z0-9_-]/g, '') + '-' + (form.variant || 'release') + '-new-signed.' + form.format;
          const updateSigning = (key: string, value: any) => setSigning((previous: any) => {
            if (key === 'keystore' || key === 'alias') {
              const cached = selectionCache.get(cacheKey) || {};
              selectionCache.set(cacheKey, { ...cached, [key]: value });
              persistSelections();
            }
            return { ...previous, [key]: value };
          });
          const rememberKeystore = (value: string) => {
            const path = value.trim();
            if (!path) return;
            setKeystores((list: any) => {
              const next = [path, ...list.filter((item: any) => item !== path)].slice(0, 8);
              const cached = selectionCache.get(cacheKey) || {};
              selectionCache.set(cacheKey, { ...cached, keystores: next });
              persistSelections();
              return next;
            });
          };
          const uniqueSignedOutput = (form: any): string => {
            const now = new Date();
            const pad = (value: any) => String(value).padStart(2, '0');
            const stamp = String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
            return defaultOutput(form).replace(/\.(apk|aab)$/i, '-' + stamp + '.$1');
          };
          const signReady = !!signing.keystore.trim() && !!signing.alias.trim() && !!signing.storePassword && !!signing.keyPassword;
          const buildAndSign = () => {
            const form = { mode: 'signed', modulePath: selectionRef.current.modulePath, variant: selectionRef.current.variant, format: artifactFormat, skipResource, ...signing, output: '' };
            form.output = uniqueSignedOutput(form);
            rememberKeystore(signing.keystore);
            perform(wizardRequest(form)).finally(() => setSigning((previous: any) => ({ ...previous, storePassword: '', keyPassword: '' })));
          };
          const openWizard = (item?: any) => {
            const form = { mode: item ? 'existing' : 'signed', modulePath: selectionRef.current.modulePath, variant: selectionRef.current.variant, format: item?.format || artifactFormat, skipResource, artifact: item?.path || '', ...signing, output: '' };
            form.output = item ? suggestSignedOutput(item.path) : defaultOutput(form);
            showInspector('signing'); setWizard(form); setWizardStep(0); updateError('operation');
          };
          // Editing the wizard's signing fields keeps the panel's reusable config in sync.
          const SIGNING_KEYS = ['keystore', 'alias', 'storePassword', 'keyPassword'];
          const updateWizard = (key: string, value: any) => {
            if (SIGNING_KEYS.includes(key)) updateSigning(key, value);
            setWizard((previous: any) => {
              const next = { ...previous, [key]: value };
              if (key === 'modulePath') next.variant = modules.find((item: any) => item.path === value)?.defaultVariant || '';
              if (key === 'artifact') { if (/\.aab$/i.test(value)) next.format = 'aab'; else if (/\.apk$/i.test(value)) next.format = 'apk'; }
              if (['modulePath', 'variant', 'format', 'artifact'].includes(key) && (!previous.output || previous.output === defaultOutput(previous))) next.output = defaultOutput(next);
              return next;
            });
          };
          const build = (format: string) => { setArtifactFormat(format); perform({ action: 'build', module: selectionRef.current.modulePath, variant: selectionRef.current.variant, format, skipResource }); };
          const readArtifacts = () => perform({ action: 'artifacts', module: selectionRef.current.modulePath, variant: selectionRef.current.variant, format: artifactFormat }, (value: any) => { addArtifacts(value); updateError('artifacts'); }, 'artifacts');
          const readLogcat = () => { setInspector('tools'); setToolTab('logcat'); perform({ action: 'logcat', serial: serialRef.current }, (value: any) => { setLogcat({ serial: value.serial, output: [value.stdout, value.stderr].filter(Boolean).join('\n').slice(-UI_OUTPUT_LIMIT) }); updateError('logcat'); }, 'logcat'); };
          const cacheWireless = (list: any) => {
            const cached = selectionCache.get(cacheKey) || {};
            selectionCache.set(cacheKey, { ...cached, wireless: list });
            persistSelections();
            return list;
          };
          const rememberWireless = (value: any) => setWirelessHistory((list: any) => value ? cacheWireless([value, ...list.filter((item: any) => item !== value)].slice(0, 8)) : list);
          const forgetWireless = (value: any) => setWirelessHistory((list: any) => cacheWireless(list.filter((item: any) => item !== value)));
          const wirelessTarget = () => wirelessAddress(wirelessHost, wirelessPort);
          const wirelessAction = (action: string, explicit?: any) => {
            const value = (explicit ?? wirelessTarget()).trim();
            lastWirelessAction.current = { action, address: value };
            return perform({ action, address: value }, (result: any) => {
              setConnectionOutput([result.stdout, result.stderr].filter(Boolean).join('\n').slice(-2000));
              if (action === 'connect') rememberWireless(value);
              if (action === 'disconnect') forgetWireless(value);
              refreshDevices();
            }, 'connection');
          };
          const button = (text: any, onClick: any, disabled: any, props: any = {}) => h('button', { type: 'button', onClick, disabled, ...props }, text);
          const artifactCards = (rows: ArtifactRow[]): any => rows.length ? h('div', { className: 'awb2-artifactlist' }, rows.map((item: any) => h(ArtifactCard, { key: item.path, item, t, onSign: openWizard, disabled: locked }))) : h('p', { className: 'awb2-toolplaceholder' }, t('artifact.empty'));
          let wizardBody: any = null;
          let wizardStepError: string | null = null;
          if (wizard) {
            const steps = wizardSteps(wizard.mode);
            const step = steps[wizardStep] || steps[0];
            const wizardModule = modules.find((item: any) => item.path === wizard.modulePath);
            const wizardVariants = Array.from(new Set([...(wizardModule?.variants || []), ...(wizard.variant ? [wizard.variant] : [])]));
            if (step === 'target') wizardStepError = wizardError({ ...wizard, mode: 'build' }, project);
            else if (step === 'artifact') wizardStepError = wizardError({ ...wizard, keystore: '_validation_', alias: 'validation', storePassword: '_validation_', keyPassword: '_validation_', output: suggestSignedOutput(wizard.artifact) }, project);
            else wizardStepError = wizardError(wizard, project);
            const formatChoice = h('div', { className: 'awb2-radios', role: 'group', 'aria-label': t('wizard.format') }, ['apk', 'aab'].map((format: any) => h('label', { key: format }, h('input', { type: 'radio', name: 'awb-format-' + sessionId, value: format, checked: wizard.format === format, disabled: locked, onChange: () => updateWizard('format', format) }), t('format.' + format))));
            const reviewRows = [[t('wizard.reviewAction'), t(wizard.mode === 'existing' ? 'wizard.reviewExisting' : 'wizard.reviewSigned')], ...(wizard.mode === 'existing' ? [[t('wizard.artifact'), wizard.artifact]] : [[t('app'), wizard.modulePath], [t('variant'), wizard.variant]]), [t('wizard.format'), t('format.' + wizard.format)], [t('wizard.keystore'), wizard.keystore], [t('wizard.alias'), wizard.alias], [t('wizard.storePassword'), wizard.storePassword ? '••••••' : '—'], [t('wizard.keyPassword'), wizard.keyPassword ? '••••••' : '—'], [t('wizard.output'), wizard.output]];
            wizardBody = h('section', { className: 'awb2-wizard', 'aria-label': t(wizard.mode === 'existing' ? 'wizard.existingTitle' : 'wizard.signedTitle') },
              h('div', { className: 'awb2-wizardhead' }, h('div', null, h('h1', null, t(wizard.mode === 'existing' ? 'wizard.existingTitle' : 'wizard.signedTitle')), h('p', { className: 'awb2-muted' }, t('wizard.description'))), button(h(SymbolIcon, { kind: 'close' }), () => setInspector(''), !!busy, { className: 'awb2-iconbutton', title: t('close'), 'aria-label': t('close') })),
              h('ol', { className: 'awb2-steps' }, steps.map((name, index) => h('li', { key: name, 'aria-current': index === wizardStep ? 'step' : undefined }, (index + 1) + ' · ' + t('wizard.step.' + name)))),
              h('div', { className: 'awb2-wizardbody' },
                step === 'target' && h(React.Fragment, null, h('p', { className: 'awb2-muted' }, t('wizard.targetHint')), formatChoice, h('div', { className: 'awb2-grid' }, h(SelectField, { label: t('app'), value: wizard.modulePath, disabled: locked, onChange: (event: any) => updateWizard('modulePath', event.target.value) }, modules.map((item: any) => h('option', { key: item.path, value: item.path }, item.path))), h(SelectField, { label: t('variant'), value: wizard.variant, disabled: locked, onChange: (event: any) => updateWizard('variant', event.target.value) }, wizardVariants.map((value: any) => h('option', { key: value, value }, value)))), h('details', { className: 'awb2-wizardadvanced' }, h('summary', null, t('manualVariant')), h('div', { className: 'awb2-row' }, h(Field, { label: t('variant'), value: wizard.variant, disabled: locked, onChange: (value: any) => updateWizard('variant', value), hint: t('manualVariantHint') })), h('div', { className: 'awb2-row' }, h('label', { className: 'awb2-check' }, h('input', { type: 'checkbox', checked: wizard.skipResource, disabled: locked, onChange: (event: any) => updateWizard('skipResource', event.target.checked) }), h('span', null, t('skipResource'), h('small', null, t('skipResourceHint'))))))),
                step === 'artifact' && h(React.Fragment, null, h('p', { className: 'awb2-muted' }, t('wizard.existingHint')), formatChoice, h('div', { className: 'awb2-row' }, h(SelectField, { label: t('wizard.artifact'), value: artifacts.some((item: any) => item.path === wizard.artifact) ? wizard.artifact : '', disabled: locked, onChange: (event: any) => updateWizard('artifact', event.target.value) }, h('option', { value: '' }, t('wizard.chooseArtifact')), artifacts.map((item: any) => h('option', { key: item.path, value: item.path }, basename(item.path))))), h('details', { className: 'awb2-wizardadvanced', open: !!wizard.artifact && !artifacts.some((item: any) => item.path === wizard.artifact) }, h('summary', null, t('wizard.manualArtifact')), h('div', { className: 'awb2-row' }, h(Field, { label: t('wizard.artifact'), value: wizard.artifact, disabled: locked, onChange: (value: any) => updateWizard('artifact', value) })))),
                step === 'signing' && h(React.Fragment, null, h('p', { className: 'awb2-muted' }, t('wizard.signingHint')), h('div', { className: 'awb2-grid' }, h(Field, { label: t('wizard.keystore'), value: wizard.keystore, disabled: locked, onChange: (value: any) => updateWizard('keystore', value) }), h(Field, { label: t('wizard.alias'), value: wizard.alias, disabled: locked, onChange: (value: any) => updateWizard('alias', value) })), h('div', { className: 'awb2-grid' }, h(SecretField, { label: t('wizard.storePassword'), value: wizard.storePassword, disabled: locked, onChange: (value: any) => updateWizard('storePassword', value), 'aria-invalid': !wizard.storePassword || wizard.storePassword.length > SECRET_LIMIT }), h(SecretField, { label: t('wizard.keyPassword'), value: wizard.keyPassword, disabled: locked, onChange: (value: any) => updateWizard('keyPassword', value), 'aria-invalid': !wizard.keyPassword || wizard.keyPassword.length > SECRET_LIMIT })), h('p', { className: 'awb2-muted' }, t('passwordOnce')), h('div', { className: 'awb2-row' }, h(Field, { label: t('wizard.output'), value: wizard.output, disabled: locked, onChange: (value: any) => updateWizard('output', value), hint: t('wizard.outputHint') }))),
                step === 'review' && h(React.Fragment, null, h('p', { className: 'awb2-muted' }, t(wizard.mode === 'existing' ? 'wizard.existingReviewHint' : 'wizard.reviewHint')), h('dl', { className: 'awb2-review' }, reviewRows.map(([label, value]: any[], index: number) => h(React.Fragment, { key: index }, h('dt', null, label), h('dd', null, value || '—')))), h('p', { className: 'awb2-success awb2-muted' }, t('wizard.noInstall')))),
              wizardStepError && h('p', { className: 'awb2-blocked', role: 'status' }, t(wizardStepError)),
              h('div', { className: 'awb2-wizardactions' }, wizardStep > 0 && button(t('wizard.back'), () => setWizardStep((value: any) => value - 1), !!busy), button(t('close'), () => setInspector(''), !!busy), step === 'review' ? button(t('wizard.generate'), () => { if (!wizardError(wizard, project)) perform(wizardRequest(wizard)).finally(() => setSigning((previous: any) => ({ ...previous, storePassword: '', keyPassword: '' }))); }, locked || !!wizardStepError, { className: 'awb2-primary' }) : button(t('wizard.next'), () => { if (!wizardStepError) setWizardStep((value: any) => value + 1); }, locked || !!wizardStepError, { className: 'awb2-primary' })));
          }
          const residentToolbar = h('div', { ref: toolbar, className: 'awb2-toolbar', role: 'toolbar', 'aria-label': t('configuration') },
              h('div', { className: 'awb2-toolbarlabel' },
                h(PopupMenu, { id: 'awb-app-' + sessionId, label: t('app'), value: selection.modulePath || t('chooseApp'), activeId: activePopup, setActiveId: setPopup, disabled: locked, className: 'awb2-appmenu' }, (close: any) => h(React.Fragment, null,
                  h('div', { className: 'awb2-popup-title', role: 'presentation' }, t('chooseApp')),
                  modules.length ? modules.map((item: any) => button(h(React.Fragment, null, h('span', { className: 'awb2-popup-check' }, item.path === selection.modulePath ? '✓' : ''), h('span', { className: 'awb2-optiontext' }, h('strong', null, item.path), h('small', null, selection.variantsByModule[item.path] || item.defaultVariant))), () => { changeModule(item.path); close(); }, false, { key: item.path, role: 'menuitemradio', 'aria-checked': item.path === selection.modulePath, className: 'awb2-popup-option' })) : h('div', { className: 'awb2-popup-footnote' }, t('noApplications')),
                  h('div', { className: 'awb2-popup-separator', role: 'separator' }),
                  h('div', { className: 'awb2-popup-title', role: 'presentation' }, t('variant')),
                  variants.map((value: any) => button(value, () => { changeVariant(value); close(); }, locked, { key: value, role: 'menuitemradio', 'aria-checked': value === selection.variant, className: 'awb2-popup-option' })),
                  h('div', { className: 'awb2-popup-footnote' }, t('popupHint'))))),
              h('div', { className: 'awb2-toolbarlabel' },
                h(PopupMenu, { id: 'awb-device-' + sessionId, label: t('device'), value: selectedDevice ? (selectedDevice.model || selectedDevice.serial) : serial || t('chooseDevice'), activeId: activePopup, setActiveId: setPopup, disabled: !!busy || !!projectError || !modules.length, className: 'awb2-devicemenu' }, (close: any) => h(React.Fragment, null,
                  h('div', { className: 'awb2-popup-title', role: 'presentation' }, t('chooseDevice')),
                  serial && !devices.some((item: any) => item.serial === serial) && button(serial + ' · ' + t('selectedMissing'), () => {}, true, { role: 'menuitemradio', 'aria-checked': true, className: 'awb2-popup-option' }),
                  devices.length ? devices.map((device: any) => button(h(React.Fragment, null, h('span', { className: 'awb2-popup-check' }, device.serial === serial ? '✓' : ''), h('span', { className: 'awb2-optiontext' }, h('strong', null, device.model || device.product || device.serial), h('small', null, device.serial + ' · ' + deviceText(device, t)))), () => { changeDevice(device.serial); close(); }, device.state !== 'device', { key: device.serial, role: 'menuitemradio', 'aria-checked': device.serial === serial, className: 'awb2-popup-option' })) : h('div', { className: 'awb2-popup-footnote' }, t('noDevices')),
                  h('div', { className: 'awb2-popup-separator', role: 'separator' }),
                  button(t('refreshDevices'), refreshDevices, devicesBusy, { role: 'menuitem', className: 'awb2-popup-option' }),
                  button(t('deviceManager'), () => { close(); showInspector('devices'); }, false, { role: 'menuitem', className: 'awb2-popup-option' }),
                  h('div', { className: 'awb2-popup-footnote' }, t('popupHint'))))),
              button(h(SymbolIcon, { kind: 'play' }), () => perform({ action: 'run', module: selectionRef.current.modulePath, variant: selectionRef.current.variant, serial: serialRef.current, skipResource }), !!blockedReason, { className: 'awb2-iconbutton awb2-run', title: blockedReason ? t(blockedReason) : t('runTitle'), 'aria-label': t('run') }),
              activeJob && button(h(SymbolIcon, { kind: 'stop' }), cancelTask, !!busy || cancelling || activeJob.status === 'stopping', { className: 'awb2-iconbutton awb2-cancel', title: t('cancel'), 'aria-label': t('cancel') }),
              h(PopupMenu, { id: 'awb-build-' + sessionId, label: t('buildOptions'), value: t('tool.build'), className: 'awb2-buildtrigger', activeId: activePopup, setActiveId: setPopup, panelMode: true, disabled: !!projectError || !modules.length }, (close: any) => h(React.Fragment, null,
                h('div', { className: 'awb2-panelhead' }, h('strong', null, t('tool.build')), h('span', null, basename(root))),
                h('label', { className: 'awb2-fieldrow' }, h('span', null, t('app')), h('select', { value: selection.modulePath, disabled: locked, onChange: (event: any) => changeModule(event.target.value) }, !modules.length && h('option', { value: '' }, '—'), modules.map((item: any) => h('option', { key: item.path, value: item.path }, item.path)))),
                h('label', { className: 'awb2-fieldrow' }, h('span', null, t('variant')), h('select', { value: selection.variant, disabled: locked, onChange: (event: any) => changeVariant(event.target.value) }, !variants.length && h('option', { value: '' }, '—'), variants.map((value: any) => h('option', { key: value, value }, value)))),
                h('div', { className: 'awb2-fieldrow' }, h('span', null, t('format')), h('div', { className: 'awb2-seg', role: 'group', 'aria-label': t('format') }, ['apk', 'aab'].map((value: any) => h('button', { key: value, type: 'button', disabled: locked, 'aria-pressed': artifactFormat === value, onClick: () => setArtifactFormat(value) }, t(value === 'apk' ? 'format.apk' : 'format.aabShort'))))),
                h('div', { className: 'awb2-popup-separator', role: 'separator' }),
                h('div', { className: 'awb2-paneltitle' }, t('signingConfig')),
                h('label', { className: 'awb2-fieldrow' }, h('span', null, t('wizard.keystore')),
                  h(React.Fragment, null,
                    h('input', { list: 'awb2-keystores-' + sessionId, value: signing.keystore, disabled: locked, placeholder: t('keystoreHint'), autoComplete: 'off', onChange: (event: any) => updateSigning('keystore', event.target.value), onBlur: () => rememberKeystore(signing.keystore) }),
                    h('datalist', { id: 'awb2-keystores-' + sessionId }, keystores.map((value: any) => h('option', { key: value, value }))))),
                h('label', { className: 'awb2-fieldrow' }, h('span', null, t('wizard.alias')), h('input', { value: signing.alias, disabled: locked, autoComplete: 'off', placeholder: t('aliasHint'), 'aria-invalid': !!signing.alias && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(signing.alias), onChange: (event: any) => updateSigning('alias', event.target.value) })),
                h('label', { className: 'awb2-fieldrow' }, h('span', null, t('wizard.storePassword')), h('input', { type: 'password', value: signing.storePassword, disabled: locked, autoComplete: 'new-password', onChange: (event: any) => updateSigning('storePassword', event.target.value) })),
                h('label', { className: 'awb2-fieldrow' }, h('span', null, t('wizard.keyPassword')), h('input', { type: 'password', value: signing.keyPassword, disabled: locked, autoComplete: 'new-password', onChange: (event: any) => updateSigning('keyPassword', event.target.value) })),
                h('div', { className: 'awb2-popup-footnote' }, t('passwordOnce')),
                h('label', { className: 'awb2-check awb2-panelcheck' }, h('input', { type: 'checkbox', checked: skipResource, disabled: locked, onChange: (event: any) => setSkipResource(event.target.checked) }), h('span', null, t('skipResource'))),
                buildError && h('p', { className: 'awb2-blocked' }, buildError),
                button(t('buildNow'), () => { close(); build(artifactFormat); }, !canBuild, { className: 'awb2-panelprimary' }),
                button(t('buildAndSign'), () => { close(); buildAndSign(); }, !canBuild || !signReady, { className: 'awb2-panelprimary awb2-panelsign', title: signReady ? t('buildAndSign') : t('signingIncomplete') }),
                h('div', { className: 'awb2-popup-separator', role: 'separator' }),
                button(t('generateSigned'), () => { close(); openWizard(null); }, locked || !modules.length, { className: 'awb2-panellink' }),
                button(t('signExisting'), () => { close(); openWizard({ path: '', format: artifactFormat }); }, locked, { className: 'awb2-panellink' }),
                wizard && button(t('resumeSigning'), () => { close(); showInspector('signing'); }, false, { className: 'awb2-panellink' }),
                button(t('tool.logcat'), () => { close(); setToolTab('logcat'); showInspector('tools'); }, !!busy, { className: 'awb2-panellink' }),
                button(t('tool.artifacts'), () => { close(); setToolTab('artifacts'); showInspector('tools'); }, !!busy, { className: 'awb2-panellink' }),
                h('div', { className: 'awb2-popup-footnote' }, t('popupHint')))),
              button(h(SymbolIcon, { kind: 'refresh' }), () => setSyncOpen(true), !!busy || syncing, { className: 'awb2-iconbutton', title: syncing ? t('syncing') : busy ? t('busy') : t('syncProject'), 'aria-label': t('syncProject') }),
              button(h(SymbolIcon, { kind: 'tasks' }), () => openTasksTab(), false, { className: 'awb2-iconbutton', title: t('tasks'), 'aria-label': t('tasks') }),
              h('span', { className: 'awb2-cardstatus' + ((projectError || errors.operation || errors.jobs || errors.observe || errors.devices) ? ' awb2-error' : !modules.length ? ' awb2-warning' : ''), role: 'status', title: projectError || errors.operation || errors.jobs || errors.observe || errors.devices || (activeJob ? jobTitle(activeJob, t) + ' · ' + statusText(activeJob, t) : !modules.length ? t('noApplications') : blockedReason ? t(blockedReason) : t('configurationReady')) }, projectError || errors.operation || errors.jobs || errors.observe || errors.devices ? t('attention') : activeJob ? statusText(activeJob, t) : busy ? t('busy') : !modules.length ? t('noApplicationsShort') : !historyKnown ? t('restoringJobs') : selectedJob ? statusText(selectedJob, t) : ''),
            syncNotice && h('span', { className: 'awb2-cardstatus' + (syncNotice.kind === 'error' ? ' awb2-error' : ' awb2-success'), role: 'status', title: syncNotice.text }, syncNotice.text),
            );
          useEffect(() => {
            const result = frame.result;
            if (!result || result.action !== 'sync' || !Array.isArray(result.variants) || !result.module) return;
            setSyncedVariants((previous: any) => previous[result.module] && previous[result.module].join() === result.variants.join() ? previous : { ...previous, [result.module]: result.variants });
            setSyncNotice({ kind: 'ok', text: t('syncedVariants').replace('{count}', String(result.variants.length)) });
          }, [frame.result, t]);
          useEffect(() => {
            if (syncNotice?.kind !== 'ok') return undefined;
            const timer = setTimeout(() => { if (alive.current) setSyncNotice(null); }, 6000);
            return () => clearTimeout(timer);
          }, [syncNotice]);
          useEffect(() => {
            if (syncNotice?.kind !== 'running') return;
            const job = frame.job;
            if (!job || job.context?.action !== 'sync') return;
            if (job.status === 'failed' || job.status === 'killed') setSyncNotice({ kind: 'error', text: errors.operation || t('syncFailed') });
          }, [frame.job, syncNotice, errors.operation, t]);
          const deviceBody = h('div', { className: 'awb2-devicespanel', 'aria-label': t('deviceManager') },
            h('p', { className: 'awb2-muted' }, t('devicesHint')),
            h(Notice, { t, message: errors.devices, retry: refreshDevices }),
            devices.length ? h('div', { className: 'awb2-devicelist' }, devices.map((device: any) => h('div', { key: device.serial, className: 'awb2-devicerow', 'aria-pressed': serial === device.serial },
              button(h(React.Fragment, null, h(Icon, { size: 20 }), h('span', { className: 'awb2-devicetext' }, h('strong', null, device.model || device.product || device.serial), h('code', null, device.serial), h('span', { className: 'awb2-devicecaption ' + (device.state === 'device' ? 'awb2-success' : 'awb2-warning') }, deviceText(device, t)))), () => changeDevice(device.serial), !!busy, { className: 'awb2-devicepick' }),
              isWirelessSerial(device.serial) && button(t('disconnect'), () => wirelessAction('disconnect', device.serial), locked, { className: 'awb2-wifiaction' })))) : h('p', { className: 'awb2-muted' }, t('noDevices')),
            h('section', { className: 'awb2-wifi', 'aria-label': t('adbWifi') },
              h('div', { className: 'awb2-wifihead' },
                h('strong', null, t('adbWifi')),
                h('div', { className: 'awb2-wifiheadactions' },
                  button(h(SymbolIcon, { kind: 'plus' }), () => setWifiOpen(true), locked, { className: 'awb2-iconbutton', title: t('connectWireless'), 'aria-label': t('connectWireless') }),
                  button(h(SymbolIcon, { kind: 'refresh' }), refreshDevices, devicesBusy, { className: 'awb2-iconbutton', title: t('refreshDevices'), 'aria-label': t('refreshDevices') }))),
              wifiOpen && h(WifiDialog, { t, host: wirelessHost, port: wirelessPort, setHost: setWirelessHost, setPort: setWirelessPort, disabled: locked, onClose: () => setWifiOpen(false), onConnect: () => { wirelessAction('connect'); setWifiOpen(false); } }),
              h(Notice, { t, message: errors.connection, retry: () => wirelessAction(lastWirelessAction.current.action, lastWirelessAction.current.address) }),
              wirelessHistory.length ? h('details', { className: 'awb2-devicefold', open: true },
                h('summary', null, t('previousDevices') + ' (' + wirelessHistory.length + ')'),
                h('div', { className: 'awb2-wifilist' }, wirelessHistory.map((item: any) => h('div', { key: item, className: 'awb2-wifidevice' },
                  h(SymbolIcon, { kind: 'wifi', size: 18 }),
                  h('div', { className: 'awb2-wifitext' }, h('code', null, item), h('span', { className: 'awb2-devicecaption' }, devices.some((device: any) => device.serial === item) ? t('connected') : t('notConnected'))),
                  button(t('connect'), () => wirelessAction('connect', item), locked, { className: 'awb2-wifiaction' }),
                  button(h(SymbolIcon, { kind: 'close', size: 13 }), () => forgetWireless(item), locked, { className: 'awb2-iconbutton', title: t('forget'), 'aria-label': t('forget') + ': ' + item }))))) : null,
              connectionOutput && h('pre', { className: 'awb2-log' }, connectionOutput)));

          const toolsBody = h('section', { className: 'awb2-tools', 'aria-label': t('toolWindows') },
              h('div', { className: 'awb2-toolheader' },
                h('div', { className: 'awb2-tabs', role: 'tablist', 'aria-label': t('toolWindows'), onKeyDown: (event: any) => { const tabs = ['logcat', 'artifacts']; let index = tabs.indexOf(toolTab); if (event.key === 'ArrowRight') index = (index + 1) % tabs.length; else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length; else if (event.key === 'Home') index = 0; else if (event.key === 'End') index = tabs.length - 1; else return; event.preventDefault(); setToolTab(tabs[index]); toolButtons.current[tabs[index]!]?.focus(); } }, ['logcat', 'artifacts'].map((tab: any) => button(t('tool.' + tab), () => { setToolTab(tab); }, false, { key: tab, role: 'tab', ref: (node: any) => { toolButtons.current[tab] = node; }, tabIndex: toolTab === tab ? 0 : -1, 'aria-selected': toolTab === tab, id: 'awb2-tab-' + tab + '-' + sessionId, 'aria-controls': 'awb2-tool-' + sessionId })))),
              h('div', { className: 'awb2-toolbody', role: 'tabpanel', id: 'awb2-tool-' + sessionId, 'aria-labelledby': 'awb2-tab-' + toolTab + '-' + sessionId },
                toolTab === 'logcat' && h(React.Fragment, null,
                  h('div', { className: 'awb2-logcatcontrols' }, button(t('readLogcat'), readLogcat, !!busy || !readyDevice), h('code', null, logcat.serial || serial)),
                  h(Notice, { t, message: errors.logcat, retry: readLogcat }),
                  h('pre', { className: 'awb2-log', tabIndex: 0, 'aria-label': t('tool.logcat') }, logcat.output || t('noLogcat'))),
                toolTab === 'artifacts' && h(React.Fragment, null,
                  h('div', { className: 'awb2-logcatcontrols' }, h('select', { value: artifactFormat, onChange: (event: any) => setArtifactFormat(event.target.value), 'aria-label': t('wizard.format') }, ['apk', 'aab'].map((format: any) => h('option', { key: format, value: format }, t('format.' + format)))), button(t('refreshArtifacts'), readArtifacts, !!busy || !selection.modulePath || !selection.variant)),
                  h(Notice, { t, message: errors.artifacts, retry: readArtifacts }),
                  artifactCards(artifacts))));
          return h('div', { className: 'awb2-shell awb2-card' }, h('style', null, CSS + POPUP_CSS + CARD_CSS), residentToolbar,
            syncOpen && h(SyncDialog, { t, module: selection.modulePath, onClose: () => setSyncOpen(false), onSync: runSync }),
            inspector && h(CardInspector, { key: inspector, id: 'awb2-inspector-' + sessionId, label: t(inspector === 'devices' ? 'deviceManager' : inspector === 'signing' ? wizard?.mode === 'existing' ? 'wizard.existingTitle' : 'wizard.signedTitle' : inspector === 'tools' ? 'tasks' : 'configuration'), anchorRef: inspectorAnchor, fallbackRef: toolbar, onClose: () => setInspector(''), t },
              h(Notice, { t, message: projectError, retry: () => refreshProject(true).catch(() => {}) }),
              h(Notice, { t, message: errors.operation }),
              inspector !== 'devices' && h(Notice, { t, message: errors.devices, retry: refreshDevices }),
              inspector !== 'tools' && h(Notice, { t, message: errors.observe, retry: () => setPollEpoch((value: any) => value + 1) }),
              !historyKnown && h(Notice, { t, message: errors.jobs ? t('jobRestoreFailed') + ' ' + errors.jobs : t('restoringJobs'), retry: errors.jobs ? () => refreshJobs(true).catch(() => {}) : null, warning: !errors.jobs }),
              activeJob && activeJob.id !== selectedJobId && h('div', { className: 'awb2-notice' }, h('span', null, t('reason.busy')), button(t('viewActiveTask'), () => chooseJob(activeJob), false)),
              inspector === 'devices' ? deviceBody : inspector === 'signing' ? wizardBody : inspector === 'tools' ? toolsBody : null));
        }

        function TasksBody({ sessionId, t, cancelJob }: TasksBodyProps): any {
          const [jobs, setJobs] = useState([]);
          const [selected, setSelected] = useState('');
          const [frame, setFrame] = useState(() => blankFrame());
          const [error, setError] = useState('');
          const [busy, setBusy] = useState(false);
          const [reloadToken, setReloadToken] = useState(0);
          const frameRef = useRef(frame);
          frameRef.current = frame;
          const selectedRef = useRef('');
          selectedRef.current = selected;
          const lastRunning = useRef('');
          const observe = async (args: any) => {
            const response = await fetch(OBSERVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'x-awb-observe': '1' }, body: JSON.stringify({ sessionId, args }) });
            const payload = await response.json().catch(() => null);
            if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : t('operationFailed'));
            return payload.value;
          };
          useEffect(() => {
            let stopped = false; let timer: any;
            const tick = async () => {
              if (!stopped && visible()) {
                try {
                  const value = await observe({ action: 'jobs' });
                  if (!stopped) {
                    const rows = Array.isArray(value.jobs) ? value.jobs : [];
                    setJobs(rows); setError('');
                    const active = rows.find(running);
                    if (active && active.id !== lastRunning.current) { lastRunning.current = active.id; setSelected(active.id); }
                    else if (!selectedRef.current) { const first = rows[0]; if (first) setSelected(first.id); }
                  }
                } catch (failure: any) { if (!stopped) setError(failure.message || t('operationFailed')); }
              }
              if (!stopped) timer = setTimeout(tick, 2500);
            };
            tick();
            return () => { stopped = true; clearTimeout(timer); };
          }, [sessionId, reloadToken]);
          useEffect(() => {
            if (!selected) return undefined;
            let stopped = false; let timer: any; let controller: AbortController | undefined;
            const poll = async () => {
              const from = frameRef.current.job?.id === selected ? frameRef.current.cursor : 0;
              controller = new AbortController();
              try {
                const value = await observe({ action: 'status', jobId: selected, from });
                if (stopped) return;
                const next = mergeJobFrame(frameRef.current, value);
                frameRef.current = next; setFrame(next);
                if (running(next.job)) timer = setTimeout(poll, 1200);
              } catch (failure: any) { if (!stopped) setError(failure.message || t('operationFailed')); }
            };
            poll();
            return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
          }, [selected, sessionId, reloadToken]);
          const cancel = async () => {
            if (!selected || busy) return;
            setBusy(true);
            try { await cancelJob(selected); } catch (failure: any) { setError(failure.message || t('operationFailed')); } finally { setBusy(false); }
          };
          return h('section', { className: 'awb2-side', 'aria-label': t('tasks') },
            h('style', null, CSS + SIDE_CSS),
            h('div', { className: 'awb2-sidehead' },
              h('strong', null, t('tasks')),
              button(h(SymbolIcon, { kind: 'refresh' }), () => setReloadToken((value: any) => value + 1), false, { className: 'awb2-iconbutton', title: t('refreshJobs'), 'aria-label': t('refreshJobs') })),
            error && h('div', { className: 'awb2-error awb2-muted', role: 'alert' }, error),
            jobs.length ? h('div', { className: 'awb2-sidelist' }, jobs.map((job: any) => h('button', {
              key: job.id, type: 'button', className: 'awb2-sidejob', 'aria-pressed': job.id === selected,
              onClick: () => { setSelected(job.id); const empty = blankFrame(job); frameRef.current = empty; setFrame(empty); },
            }, h('span', { className: 'awb2-sidejobtitle' }, jobTitle(job, t)), h('span', { className: 'awb2-sidejobstate' }, statusText(job, t))))) : h('p', { className: 'awb2-muted' }, t('noJobs')),
            selected && h('div', { className: 'awb2-sidebody' },
              h('div', { className: 'awb2-tasksummary' }, h('strong', null, jobTitle(frame.job, t)), h('span', null, statusText(frame.job, t)),
                running(frame.job) && button(t('cancel'), cancel, busy, { className: 'awb2-cancel' })),
              h('pre', { className: 'awb2-log', tabIndex: 0, 'aria-label': t('tasks') }, frame.output || t('noOutput'))));
        }
        function SessionToolbar(props: SessionToolbarProps): any {
          return h(SessionWorkbench, { key: props.sessionId, sessionId: props.sessionId, t: props.t });
        }
        const SIDEBAR_TAB_ID = '@kaus-io/dsh-android-studio/tasks';
        ctx.effect(() => {
          openTasksTab = () => {
            try { ctx.sidebarRight?.openTab?.('androidTasks'); return true; }
            catch (error) { console.warn('[android-studio] could not open the tasks tab:', error); return false; }
          };
          if (typeof ctx.sidebarRightTabs?.register !== 'function') return undefined;
          try {
            return ctx.sidebarRightTabs.register({
              id: SIDEBAR_TAB_ID,
              kind: 'androidTasks',
              priority: 'extension',
              title: () => translate('tasks'),
            });
          } catch (error) { console.warn('[android-studio] tasks tab type registration failed:', error); return undefined; }
        }, 'android-studio.sidebar-tab');
        ctx.effect(() => {
          if (typeof ctx.sidebarRightTabs?.register !== 'function') return undefined;
          return ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab', key: SIDEBAR_TAB_ID, locale: 'androidWorkbench',
            inject: (sessionId: any) => ({ sessionId, cancelJob: async (jobId: any) => {
              const response = await fetch(ACTION_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'x-awb-action': '1' }, body: JSON.stringify({ sessionId, args: { action: 'cancel', jobId } }) });
              const payload = await response.json().catch(() => null);
              if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : translate('operationFailed'));
              return payload.value;
            } }),
          }, TasksBody));
        }, 'android-studio.sidebar-body');
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'android-studio-session-toolbar', order: 25, locale: 'androidWorkbench' }, SessionToolbar));
}
