const version = "0.1.0"
import { pluginOptionsHandler } from "./functions/pluginOptionsHandler.js"
import { plugin } from "./functions/plugin.js"
import { nestCssLayers } from "./functions/nestCssLayers.js"
import variables from "./functions/variables.js"
import themesObject from "./theme/object.js"
import { base, components, utilities } from "./imports.js"
import db from "./db/index.js"

export default plugin.withOptions(
  (options) => {
    return ({ addBase, addComponents, addUtilities, addVariant }) => {
      const {
        include,
        exclude,
        prefix = "",
      } = pluginOptionsHandler(options, addBase, themesObject, version)

      const shouldIncludeItem = (name) => {
        if (include && exclude) {
          return include.includes(name) && !exclude.includes(name)
        }
        if (include) {
          return include.includes(name)
        }
        if (exclude) {
          return !exclude.includes(name)
        }
        return true
      }

      Object.entries(base).forEach(([name, item]) => {
        if (!shouldIncludeItem(name)) return
        item({ addBase, prefix })
      })

      Object.entries(components).forEach(([name, item]) => {
        if (!shouldIncludeItem(name)) return
        item({
          addComponents: (styles) => addComponents(nestCssLayers(styles)),
          prefix,
        })
      })

      Object.entries(utilities).forEach(([name, item]) => {
        if (!shouldIncludeItem(name)) return
        item({
          addUtilities: (styles) => addUtilities(nestCssLayers(styles)),
          prefix,
        })
      })

      // db-style 覆写层：最后注册，写入高于 daisyUI 全部子层的 @layer dob。
      // 只要没有显式 exclude: "db"，就随插件一起生效（include 白名单不应把它漏掉）。
      if (!exclude?.includes("db")) {
        db({ addBase, addComponents })
      }

      // drawer variants. Can not be nested in layers so defined here
      addVariant(
        `${prefix}is-drawer-close`,
        `&:where(.${prefix}drawer-toggle:not(:checked) ~ .${prefix}drawer-side, .${prefix}drawer-toggle:not(:checked) ~ .${prefix}drawer-side *)`,
      )
      addVariant(
        `${prefix}is-drawer-open`,
        `&:where(.${prefix}drawer-toggle:checked ~ .${prefix}drawer-side, .${prefix}drawer-toggle:checked ~ .${prefix}drawer-side *)`,
      )
    }
  },
  () => ({
    theme: {
      extend: variables,
    },
  }),
)
