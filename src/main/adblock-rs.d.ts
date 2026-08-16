declare module 'adblock-rs' {
  export const RuleTypes: {
    readonly ALL: string
    readonly NETWORK_ONLY: string
    readonly COSMETIC_ONLY: string
  }

  export class FilterSet {
    constructor(debug?: boolean)
    addFilters(
      filters: string,
      options?: {
        rule_types?: string
      }
    ): unknown
  }

  export class Engine {
    constructor(filterSet: FilterSet)
    check(url: string, sourceUrl: string, requestType: string, method?: string): boolean
  }
}
