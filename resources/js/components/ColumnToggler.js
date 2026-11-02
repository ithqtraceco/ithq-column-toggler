import isEqual from 'lodash/isEqual'
import cloneDeep from 'lodash/cloneDeep'

export function toList(state) {
    return state.filter(({visible}) => visible).map(({attribute}) => attribute)
}

export function encode(state) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(state))))
}

export function decode(state) {
    return state ? JSON.parse(decodeURIComponent(escape(atob(state)))) : null
}

export async function getStateFromLocalStorage(cacheKey, viaRelationship = null) {

    const value = localStorage.getItem(await generateCacheKey(cacheKey, viaRelationship))

    if (value === null) {
        return true
    }

    return decode(value)

}

export async function saveStateToLocalStorage(state, cacheKey, viaRelationship = null) {
    localStorage.setItem(await generateCacheKey(cacheKey, viaRelationship), encode(state))
}


// viaRelationship is part of the key because the same resource's field list
// can have a different shape depending on context — several Product fields
// use showOnIndex(fn($request) => !$request->viaRelationship), so viewing
// Products directly vs. via a Supplier's relationship tab yields different
// field positions. Without this, a selection cached from one context gets
// wrongly reused in the other, where positions no longer line up — showing
// duplicate/wrong columns. Omitted (via filter(Boolean)) when not viewing
// via a relationship, so existing cache keys for direct resource views
// don't change.
export async function generateCacheKey(cacheKey, viaRelationship = null) {
    return [
        'column-toggler',
        cacheKey,
        viaRelationship,
        (await Nova.$router.decryptHistory()).props?.lens,
        Nova.config('column_toggler').enable_sorting,
    ].filter(Boolean).join('/')
}

export function registerMixin(component) {

    if (component.computed.resourceRequestQueryString === undefined) {
        component = component.mixins.find(({computed}) => typeof computed.resourceRequestQueryString === 'function')
    }

    const originalResourceRequestQueryString = component.computed.resourceRequestQueryString

    component.mixins.push({
        created() {
            Nova.$on(this.columnTogglerEventKey, this.columnTogglerOnStateChange)
        },
        unmounted() {
            Nova.$off(this.columnTogglerEventKey, this.columnTogglerOnStateChange)
        },
        async beforeMount() {
            this.columnTogglerState = await  getStateFromLocalStorage(this.resourceName, this.actionQueryString?.viaRelationship)
        },
        data() {
            return {
                columnTogglerState: true,
            }
        },
        methods: {
            async columnTogglerOnStateChange(state) {

                const currentState = this.columnTogglerState

                if (isEqual(state, currentState) === false) {

                    await saveStateToLocalStorage(state, this.resourceName, this.actionQueryString?.viaRelationship)

                    this.columnTogglerState = cloneDeep(state)

                    if (currentState !== true) {
                        this.getResources()
                    }

                }

            },
        },
        computed: {
            columnTogglerEventKey() {
                return `column-toggler:state-changed:${[this.resourceName, this.lens, this.actionQueryString?.viaRelationship].filter(Boolean).join('/')}`
            },
            columnTogglerEncodedColumns() {

                if (typeof this.columnTogglerState === 'boolean') {
                    return this.columnTogglerState
                }
                const columns = toList(this.columnTogglerState)

                if (columns.length === 0) {
                    return false
                }

                return encode(columns)

            },
        },
    })

    component.computed.resourceRequestQueryString = function () {
        return {
            ...originalResourceRequestQueryString.call(this),
            columnToggler: this.columnTogglerEncodedColumns,
        }
    }

}
