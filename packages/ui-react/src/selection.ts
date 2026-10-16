import { getSymbology, isCompatible, symbologies } from '@astmatrix/symbology-catalog';
import type { CodeTab } from '@astmatrix/symbology-catalog';
export interface Selection {
  symbologyId: string;
  profileId: string;
}
export interface SelectionState extends Selection {
  tab: CodeTab;
  lastByTab: Record<CodeTab, Selection>;
  profileBySymbology: Record<string, string>;
}
export type SelectionAction =
  | { type: 'restore'; symbologyId: string; profileId: string }
  | { type: 'tab'; tab: CodeTab }
  | { type: 'symbology'; id: string }
  | { type: 'profile'; id: string };
export const initialSelection: SelectionState = {
  tab: 'barcode',
  symbologyId: 'ean13',
  profileId: 'ean13-default',
  lastByTab: {
    barcode: { symbologyId: 'ean13', profileId: 'ean13-default' },
    matrix: { symbologyId: 'qrcode', profileId: 'qr-default' },
  },
  profileBySymbology: {},
};
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  let tab = state.tab,
    symbologyId = state.symbologyId,
    profileId = state.profileId;
  if (action.type === 'restore') {
    if (!isCompatible(action.symbologyId, action.profileId)) return state;
    tab = getSymbology(action.symbologyId).tab;
    symbologyId = action.symbologyId;
    profileId = action.profileId;
  } else if (action.type === 'tab') {
    tab = action.tab;
    const previous = state.lastByTab[tab];
    const symbol =
      symbologies.find((s) => s.id === previous.symbologyId && s.tab === tab) ??
      symbologies.find((s) => s.tab === tab)!;
    symbologyId = symbol.id;
    profileId = isCompatible(symbol.id, previous.profileId)
      ? previous.profileId
      : symbol.defaultProfileId;
  } else if (action.type === 'symbology') {
    let symbol;
    try {
      symbol = getSymbology(action.id);
    } catch {
      return state;
    }
    if (symbol.tab !== tab) return state;
    symbologyId = symbol.id;
    const saved = state.profileBySymbology[symbol.id];
    profileId = saved && isCompatible(symbol.id, saved) ? saved : symbol.defaultProfileId;
  } else {
    if (!isCompatible(symbologyId, action.id)) return state;
    profileId = action.id;
  }
  return {
    tab,
    symbologyId,
    profileId,
    lastByTab: { ...state.lastByTab, [tab]: { symbologyId, profileId } },
    profileBySymbology: { ...state.profileBySymbology, [symbologyId]: profileId },
  };
}
