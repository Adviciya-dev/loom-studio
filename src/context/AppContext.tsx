import { createContext, useContext, useReducer, type Dispatch } from 'react'
import { reducer } from './reducer'
import { initialState, type AppState, type AppAction } from './types'

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}
