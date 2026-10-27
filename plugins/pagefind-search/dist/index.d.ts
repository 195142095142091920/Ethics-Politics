import { QuartzComponent } from "@quartz-community/types"

interface PagefindSearchOptions {
  enablePreview: boolean
  resultLimit: number
}

declare const PagefindSearch: (userOpts?: Partial<PagefindSearchOptions>) => QuartzComponent

export { PagefindSearch, type PagefindSearchOptions }
