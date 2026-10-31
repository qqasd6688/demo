import { getSiteBuildingBinding } from './runtime/geometry.js'
import { HEART_TREE } from './data/landmarks.js'
import { LIN_ZEXU_MEMORIAL } from './data/linzexu-memorial.js'

// 同一份建筑关联同时供列表可选状态、地图拾取和自动导览消费，避免两套关联判断。
export function createGuideModel(snapshot) {
  // 原始快照保持独立；建筑、拾取、小地图和相机统一消费这份补全后的模型。
  const data = {
    ...snapshot,
    buildings: [...snapshot.buildings, ...LIN_ZEXU_MEMORIAL.buildings],
    sites: snapshot.sites.map((site) =>
      site.id === LIN_ZEXU_MEMORIAL.id
        ? {
            ...site,
            position: LIN_ZEXU_MEMORIAL.labelPosition,
            source: LIN_ZEXU_MEMORIAL.source,
            subtitle: '祠堂、展厅与鹤池相连的园林式纪念馆',
            description:
              '北部保留林文忠公祠的院落，南部展厅环绕鹤池布置。馆区依据 OSM 边界定位，内部建筑参照现场导览图示意补建，尺寸与高度并非测绘数据。',
            coordinateNote: '馆区内示意落点 · WGS84',
            // 澳门路主入口来自馆区边界上的 entrance=main 节点；导览从路边出发。
            tourPosition: [119.2928631, 26.081719],
          }
        : site,
    ),
  }
  // 从南侧纪念馆向北排列；编号只在模型中生成，列表、地图和小地图共用，原始快照不改写。
  const places = [...data.sites, HEART_TREE]
    .sort((a, b) => a.position[1] - b.position[1])
    .map((place, index) => ({ ...place, number: String(index + 1).padStart(2, '0') }))
  const landmarks = places.filter((place) => place.kind === 'landmark')
  data.sites = places.filter((place) => place.kind !== 'landmark')
  // 导览图单列的游客中心只作为地图配套标识，不增加精选数量或冒充纪念馆展厅。
  const visitorIndex = data.buildings.findIndex((building) => building.id === 705649921)
  const visitorBuilding = data.buildings[visitorIndex]
  const contextPlaces = visitorBuilding
    ? [
        {
          id: 'visitor-center',
          kind: 'context',
          buildingIndex: visitorIndex,
          name: visitorBuilding.name,
          category: '游客服务',
          subtitle: '纪念馆东南侧的游客服务建筑',
          description:
            '现场导览图将这里单列为 23 号“三坊七巷游客中心”，与纪念馆展厅分别标注。此处保留 OSM 中的建筑轮廓，高度与屋顶为示意。',
          position: [0, 1].map(
            (axis) =>
              visitorBuilding.ring.slice(0, -1).reduce((sum, p) => sum + p[axis], 0) /
              (visitorBuilding.ring.length - 1),
          ),
          labelHeight: visitorBuilding.height + 3,
          source: LIN_ZEXU_MEMORIAL.source,
        },
      ]
    : []
  const placesById = new Map(
    [...places, ...contextPlaces, ...data.lanes].map((place) => [place.id, place]),
  )
  const siteBindings = new Map(
    data.sites.map((place) => [
      place.id,
      getSiteBuildingBinding(place, data.buildings, data.meta.origin),
    ]),
  )
  const siteBuildings = new Map([...siteBindings].map(([id, binding]) => [id, binding.indices]))
  // 从纪念馆沿澳门路、南后街向北，只选沿途五站，不为覆盖侧巷景点折返。
  const tourIds = ['linzexu', 'folk', 'intangible', 'heart-tree', 'linjuemin'].filter(
    (id) => placesById.get(id)?.kind === 'landmark' || siteBuildings.get(id)?.length,
  )
  return {
    data,
    memorial: LIN_ZEXU_MEMORIAL,
    places,
    contextPlaces,
    landmarks,
    placesById,
    siteBindings,
    siteBuildings,
    tourIds,
  }
}
