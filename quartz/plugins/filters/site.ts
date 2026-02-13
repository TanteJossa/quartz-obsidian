import { QuartzFilterPlugin } from "../types"

export const RemoveSiteFalse: QuartzFilterPlugin<{}> = () => ({
  name: "RemoveSiteFalse",
  shouldPublish(_ctx, [_tree, vfile]) {
    const siteFlag: boolean =
      vfile.data?.frontmatter?.site === false || vfile.data?.frontmatter?.site === "false"
    return !siteFlag
  },
})
