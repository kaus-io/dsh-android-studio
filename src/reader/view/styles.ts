/** 阅读器样式：Xcode 风格语法配色与紧凑编辑器。 / Reader styles: Xcode-style syntax colours in a compact editor. */

export const STYLE_ID = '@kaus-io/dsh-android-studio/CodeReader.css'

const CSS = `
.dcr_root{
  --dcr-line-height:20px;
  --dcr-font-size:13px;
  --dcr-code-pad-left:12px;
  --dcr-code-pad-right:16px;
  --dcr-bg:#ffffff;
  --dcr-fg:#000000;
  --dcr-bar-bg:#f7f7f7;
  --dcr-tab-fg:#3c3c43;
  --dcr-border:#e1e1e1;
  --dcr-active:#f2f7fd;
  --dcr-hover:#f7f7f7;
  --dcr-gutter:#8a8a8e;
  --dcr-gutter-active:#000000;
  --dcr-accent:#0a84ff;
  --dcr-selection:#b3d7ff;
  --dcr-popover-bg:#ffffff;
  --dcr-popover-border:#d1d1d6;
  --dcr-input-bg:#ffffff;
  --dcr-input-border:#c7c7cc;
  --dcr-chip-bg:#e8e8ed;
  --dcr-chip-fg:#3c3c43;
  --dcr-toggle-on-bg:#0a84ff;
  --dcr-toggle-on-fg:#ffffff;
  --dcr-scrollbar:rgba(0,0,0,.24);
  --dcr-scrollbar-hover:rgba(0,0,0,.42);
  --dcr-match-bg:#ffe9a8;
  --dcr-match-border:#d9b84a;
  --dcr-match-current-bg:#ffd54f;
  --dcr-match-current-border:#b38f00;
  --dcr-usage-bg:#b3d7ff66;
  --dcr-flash-bg:#ffe9a8;
  --dcr-syn-comment:#5d6c79;
  --dcr-syn-keyword:#ad3da4;
  --dcr-syn-type:#3f6e74;
  --dcr-syn-function:#4b21b0;
  --dcr-syn-string:#d12f1b;
  --dcr-syn-number:#1c00cf;
  --dcr-syn-constant:#1c00cf;
  --dcr-syn-annotation:#836c28;
  --dcr-syn-operator:#000000;
  --dcr-syn-punct:#000000;
  --dcr-syn-tag:#3f6e74;
  --dcr-syn-attr:#836c28;
  --dcr-syn-key:#3f6e74;
  --dcr-syn-variable:#000000;
  --dcr-syn-meta:#78492a;
  --dcr-syn-inserted:#2e7d32;
  --dcr-syn-deleted:#c62828;
  --dcr-syn-invalid:#c62828;
  display:flex;
  flex-direction:column;
  position:absolute;
  inset:0;
  min-height:0;
  width:100%;
  background:var(--dcr-bg);
  color:var(--dcr-fg);
  font-family:var(--dsw-font-family,inherit);
  font-size:12px;
  line-height:var(--dcr-line-height);
  white-space:normal;
}
.dark .dcr_root,[data-ds-dark-theme] .dcr_root{
  --dcr-bg:#292a30;
  --dcr-fg:#ffffff;
  --dcr-bar-bg:#2b2c31;
  --dcr-tab-fg:#d7d7d7;
  --dcr-border:#3a3b40;
  --dcr-active:#303136;
  --dcr-hover:#303136;
  --dcr-gutter:#6c7986;
  --dcr-gutter-active:#ffffff;
  --dcr-accent:#0a84ff;
  --dcr-selection:#515e70;
  --dcr-popover-bg:#2f3036;
  --dcr-popover-border:#46474d;
  --dcr-input-bg:#1f2024;
  --dcr-input-border:#4a4b52;
  --dcr-chip-bg:#3a3b40;
  --dcr-chip-fg:#e5e5e5;
  --dcr-toggle-on-bg:#0a84ff;
  --dcr-toggle-on-fg:#ffffff;
  --dcr-scrollbar:rgba(255,255,255,.24);
  --dcr-scrollbar-hover:rgba(255,255,255,.42);
  --dcr-match-bg:#7a6a1f80;
  --dcr-match-border:#b8a24a;
  --dcr-match-current-bg:#8a7420;
  --dcr-match-current-border:#ffd54f;
  --dcr-usage-bg:#515e70;
  --dcr-flash-bg:#ffd54f33;
  --dcr-syn-comment:#7f8c98;
  --dcr-syn-keyword:#fc5fa3;
  --dcr-syn-type:#5dd8ff;
  --dcr-syn-function:#67b7a4;
  --dcr-syn-string:#fc6a5d;
  --dcr-syn-number:#d0bf69;
  --dcr-syn-constant:#d0bf69;
  --dcr-syn-annotation:#b281eb;
  --dcr-syn-operator:#ffffff;
  --dcr-syn-punct:#ffffff;
  --dcr-syn-tag:#fc5fa3;
  --dcr-syn-attr:#b281eb;
  --dcr-syn-key:#67b7a4;
  --dcr-syn-variable:#ffffff;
  --dcr-syn-meta:#fd8f3f;
  --dcr-syn-inserted:#7fd88f;
  --dcr-syn-deleted:#ff8170;
  --dcr-syn-invalid:#ff8170;
}
.dcr_bar{
  flex:none;display:flex;align-items:center;gap:2px;height:30px;padding:0 6px 0 4px;
  border-bottom:1px solid var(--dcr-border);background:var(--dcr-bar-bg);
  font-family:var(--dsw-font-family,inherit);font-size:11px;min-width:0;white-space:nowrap;
}
.dcr_crumbs{display:flex;align-items:center;gap:0;flex:1;min-width:0;overflow:hidden;white-space:nowrap;padding-left:4px}
.dcr_fileName{
  color:var(--dcr-gutter);font-size:11px;padding:0 7px 0 3px;max-width:240px;flex:none;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.dcr_crumb{
  border:0;background:0 0;color:var(--dcr-tab-fg);font:inherit;padding:2px 4px;border-radius:3px;
  cursor:pointer;max-width:190px;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0;
}
.dcr_crumb:hover{background:var(--dcr-hover);color:var(--dcr-fg)}
.dcr_crumb:last-child{color:var(--dcr-fg)}
.dcr_crumb:focus-visible{outline:1px solid var(--dcr-accent);outline-offset:-1px}
.dcr_sep{color:var(--dcr-gutter);flex:none;display:inline-flex;align-items:center;opacity:.7}
.dcr_icon{
  width:22px;height:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;
  border:0;border-radius:4px;background:0 0;color:var(--dcr-tab-fg);cursor:pointer;padding:0;
}
.dcr_icon:hover{background:var(--dcr-hover);color:var(--dcr-fg)}
.dcr_icon[data-active=true]{background:var(--dcr-hover);color:var(--dcr-fg)}
.dcr_icon:focus-visible{outline:1px solid var(--dcr-accent);outline-offset:-1px}
.dcr_icon:disabled{cursor:default;opacity:.4}
.dcr_icon:disabled:hover{background:0 0;color:var(--dcr-tab-fg)}
.dcr_editor{
  flex:1;min-width:0;min-height:0;position:relative;overflow:auto;outline:none;
  background:var(--dcr-bg);color:var(--dcr-fg);
  font-family:var(--dsw-font-mono,"SF Mono",Menlo,Monaco,Consolas,monospace);
  font-size:var(--dcr-font-size);line-height:var(--dcr-line-height);
  font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0;
  letter-spacing:normal;word-spacing:normal;tab-size:4;scrollbar-width:thin;
  scrollbar-color:var(--dcr-scrollbar) transparent;
}
.dcr_editor:focus-visible{box-shadow:inset 0 0 0 1px var(--dcr-accent)}
.dcr_editor::-webkit-scrollbar{width:12px;height:12px}
.dcr_editor::-webkit-scrollbar-track{background:transparent}
.dcr_editor::-webkit-scrollbar-thumb{background:var(--dcr-scrollbar);border:3px solid transparent;background-clip:padding-box;border-radius:6px}
.dcr_editor::-webkit-scrollbar-thumb:hover{background:var(--dcr-scrollbar-hover);background-clip:padding-box}
.dcr_editor::-webkit-scrollbar-corner{background:transparent}
.dcr_canvas{position:relative;min-width:100%}
.dcr_window{position:absolute;top:0;left:0;right:0}
.dcr_row{display:flex;align-items:stretch;width:100%;height:var(--dcr-line-height);position:relative;box-sizing:border-box}
.dcr_row[data-active=true]{background:var(--dcr-active)}
.dcr_row:not([data-active=true]):hover{background:var(--dcr-hover)}
.dcr_row[data-flash=true]{background:var(--dcr-flash-bg);transition:background 120ms ease-out}
.dcr_gutter{
  position:sticky;left:0;z-index:2;flex:none;display:flex;align-items:flex-start;justify-content:flex-end;
  height:100%;box-sizing:border-box;padding:0 10px 0 0;background:var(--dcr-bg);user-select:none;
}
.dcr_row[data-active=true] .dcr_gutter{background:var(--dcr-active)}
.dcr_row:not([data-active=true]):hover .dcr_gutter{background:var(--dcr-hover)}
.dcr_ln{
  color:var(--dcr-gutter);font-size:11px;line-height:var(--dcr-line-height);
  font-variant-numeric:tabular-nums;padding:0 1px;text-align:right;
}
.dcr_row[data-active=true] .dcr_ln{color:var(--dcr-gutter-active)}
.dcr_fold{
  width:15px;height:var(--dcr-line-height);flex:none;display:inline-flex;align-items:center;justify-content:center;
  border:0;background:0 0;padding:0;color:var(--dcr-gutter);cursor:pointer;opacity:0;transition:opacity 80ms;
}
.dcr_row:hover .dcr_fold,.dcr_fold:focus-visible,.dcr_fold[data-folded=true]{opacity:1}
.dcr_fold:hover{color:var(--dcr-fg)}
.dcr_fold svg{transition:transform 100ms}
.dcr_fold[data-folded=true] svg{transform:rotate(-90deg)}
.dcr_code{
  position:relative;flex:1;min-width:0;box-sizing:border-box;
  padding:0 var(--dcr-code-pad-right) 0 var(--dcr-code-pad-left);white-space:pre;overflow:visible;
}
.dcr_root[data-wrap=true] .dcr_code{white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere}
.dcr_tok{white-space:inherit}
.dcr_com{color:var(--dcr-syn-comment)}
.dcr_kw{color:var(--dcr-syn-keyword)}
.dcr_ty{color:var(--dcr-syn-type)}
.dcr_fn{color:var(--dcr-syn-function)}
.dcr_str{color:var(--dcr-syn-string)}
.dcr_num{color:var(--dcr-syn-number)}
.dcr_const{color:var(--dcr-syn-constant)}
.dcr_ann{color:var(--dcr-syn-annotation)}
.dcr_op{color:var(--dcr-syn-operator)}
.dcr_punc{color:var(--dcr-syn-punct)}
.dcr_tag{color:var(--dcr-syn-tag)}
.dcr_attr{color:var(--dcr-syn-attr)}
.dcr_key{color:var(--dcr-syn-key)}
.dcr_var{color:var(--dcr-syn-variable)}
.dcr_meta{color:var(--dcr-syn-meta)}
.dcr_ins{color:var(--dcr-syn-inserted)}
.dcr_del{color:var(--dcr-syn-deleted)}
.dcr_inv{color:var(--dcr-syn-invalid)}
.dcr_match{background:var(--dcr-match-bg);border-radius:2px;box-shadow:inset 0 0 0 1px var(--dcr-match-border)}
.dcr_match[data-current=true]{background:var(--dcr-match-current-bg);box-shadow:inset 0 0 0 1px var(--dcr-match-current-border)}
.dcr_usage{background:var(--dcr-usage-bg);border-radius:2px}
.dcr_bracketMatch{box-shadow:inset 0 0 0 1px var(--dcr-accent);border-radius:2px}
.dcr_foldChip{
  display:inline-flex;align-items:center;height:16px;margin-left:10px;padding:0 7px;border-radius:8px;
  background:var(--dcr-chip-bg);color:var(--dcr-chip-fg);font-size:10px;line-height:16px;
  vertical-align:middle;user-select:none;cursor:pointer;white-space:nowrap;
}
.dcr_foldChip:hover{filter:brightness(.96)}
.dcr_empty{
  flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  color:var(--dcr-gutter);font-family:var(--dsw-font-family,inherit);font-size:12px;
}
.dcr_emptyTitle{color:var(--dcr-fg);font-size:13px}
.dcr_popover{
  position:absolute;z-index:30;display:flex;flex-direction:column;
  background:var(--dcr-popover-bg);border:1px solid var(--dcr-popover-border);
  border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.16);
  font-family:var(--dsw-font-family,inherit);font-size:12px;color:var(--dcr-fg);
  overflow:hidden;min-width:0;
}
.dark .dcr_popover,[data-ds-dark-theme] .dcr_popover{box-shadow:0 8px 24px rgba(0,0,0,.55)}
.dcr_find{top:34px;right:8px;flex-direction:row;align-items:center;gap:4px;padding:4px;max-width:calc(100% - 16px);flex-wrap:wrap}
.dcr_noticeInline{flex-basis:100%;text-align:right;font-size:10px;color:var(--dcr-gutter);white-space:nowrap}
.dcr_input{
  height:22px;box-sizing:border-box;border:1px solid var(--dcr-input-border);border-radius:4px;
  background:var(--dcr-input-bg);color:var(--dcr-fg);font:inherit;font-size:12px;padding:0 6px;outline:none;min-width:0;
}
.dcr_input:focus{border-color:var(--dcr-accent);box-shadow:0 0 0 1px var(--dcr-accent)}
.dcr_findInput{width:180px;max-width:36vw}
.dcr_toggle{
  height:22px;min-width:22px;padding:0 5px;border:1px solid transparent;border-radius:4px;background:0 0;
  color:var(--dcr-tab-fg);font:inherit;font-size:11px;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;flex:none;
}
.dcr_toggle:hover{background:var(--dcr-hover);color:var(--dcr-fg)}
.dcr_toggle[data-on=true]{background:var(--dcr-toggle-on-bg);color:var(--dcr-toggle-on-fg);border-color:var(--dcr-toggle-on-bg)}
.dcr_toggle:focus-visible{outline:1px solid var(--dcr-accent);outline-offset:-1px}
.dcr_count{
  min-width:50px;text-align:center;color:var(--dcr-gutter);font-size:11px;
  font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 2px;
}
.dcr_countError{color:var(--dcr-syn-invalid)}
.dcr_outline{top:34px;left:8px;width:min(330px,calc(100% - 16px));max-height:min(62%,440px)}
.dcr_panelHead{display:flex;align-items:center;gap:4px;padding:4px;border-bottom:1px solid var(--dcr-popover-border);flex:none}
.dcr_panelHead .dcr_input{flex:1}
.dcr_panelTitle{padding:2px 6px;color:var(--dcr-tab-fg);font-size:11px;white-space:nowrap;flex:none}
.dcr_list{overflow:auto;padding:4px;min-height:0;flex:1;scrollbar-width:thin}
.dcr_item{
  display:flex;align-items:center;gap:6px;width:100%;height:22px;padding:0 6px;border:0;border-radius:3px;
  background:0 0;color:var(--dcr-tab-fg);font:inherit;font-size:12px;text-align:left;cursor:pointer;
  white-space:nowrap;box-sizing:border-box;
}
.dcr_item:hover,.dcr_item[data-active=true]{background:var(--dcr-hover);color:var(--dcr-fg)}
.dcr_item:focus-visible{outline:1px solid var(--dcr-accent);outline-offset:-1px}
.dcr_item[data-current=true]{color:var(--dcr-fg)}
.dcr_itemMark{width:14px;flex:none;text-align:center;font-size:9px;font-weight:600;color:var(--dcr-gutter);text-transform:uppercase}
.dcr_itemName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dcr_itemLine{color:var(--dcr-gutter);font-variant-numeric:tabular-nums;font-size:10px;flex:none}
.dcr_emptyList{padding:14px 10px;text-align:center;color:var(--dcr-gutter);font-size:12px}
.dcr_goto{top:34px;left:50%;transform:translateX(-50%);width:min(280px,calc(100% - 24px));padding:8px;gap:6px}
.dcr_gotoRow{display:flex;align-items:center;gap:6px}
.dcr_gotoInput{flex:1;width:100%}
.dcr_gotoHint{color:var(--dcr-gutter);font-size:11px;padding:0 2px}
.dcr_gotoError{color:var(--dcr-syn-invalid);font-size:11px;padding:0 2px}
.dcr_btn{
  height:22px;padding:0 10px;border:1px solid var(--dcr-popover-border);border-radius:4px;
  background:var(--dcr-input-bg);color:var(--dcr-fg);font:inherit;font-size:12px;cursor:pointer;flex:none;
}
.dcr_btn:hover{background:var(--dcr-hover)}
.dcr_btnPrimary{background:var(--dcr-accent);color:#ffffff;border-color:var(--dcr-accent)}
.dcr_btnPrimary:hover{filter:brightness(1.08)}
.dcr_btn:disabled{opacity:.5;cursor:default}
.dcr_root button{font-family:var(--dsw-font-family,inherit)}
.dcr_root button:focus-visible{outline:1px solid var(--dcr-accent);outline-offset:-1px}
.dcr_root ::selection{background:var(--dcr-selection)}
@media (prefers-reduced-motion:reduce){
  .dcr_fold svg,.dcr_row[data-flash=true]{transition:none;animation:none}
}
`

/** 安装阅读器样式表。 / Install the reader stylesheet for the plugin lifetime. */
export function installStyles(styleId: string = STYLE_ID): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(styleId)}]`)
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = '@kaus-io/dsh-android-studio'
  tag.dataset.pluginCss = styleId
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}
