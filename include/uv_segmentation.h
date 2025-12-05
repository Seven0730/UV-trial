#pragma once

#include <vector>
#include <set>
#include <Eigen/Core>

namespace UVUnwrapping {

/**
 * @brief 表示一个边的结构
 */
struct Edge {
    int v0, v1;  // 顶点索引
    
    Edge(int a, int b) : v0(std::min(a, b)), v1(std::max(a, b)) {}
    
    bool operator<(const Edge& other) const {
        return v0 < other.v0 || (v0 == other.v0 && v1 < other.v1);
    }
};

/**
 * @brief UV 岛结构
 */
struct UVIsland {
    std::vector<int> faces;        // 面索引
    std::vector<Edge> boundary;    // 边界边
    Eigen::Vector3d centroid;      // 质心
    double area;                   // 面积
};

/**
 * @brief 按拓扑环（Edge Loop）分割网格
 * 
 * 适用场景：
 * - 角色脖子
 * - 衣服袖口
 * - 裤脚
 * - 机械部件的接合介面
 * 
 * @param V 顶点矩阵 (n x 3)
 * @param F 面矩阵 (m x 3)
 * @param edge_loops 预定义的边环列表
 * @return UV 岛列表
 */
std::vector<UVIsland> segmentByEdgeLoops(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<std::vector<int>>& edge_loops
);

/**
 * @brief 检测边环
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param feature_angle 特征角度阈值（度数）
 * @return 检测到的边环
 */
std::vector<std::vector<int>> detectEdgeLoops(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double feature_angle = 30.0
);

/**
 * @brief 高曲率切线分割
 * 
 * 适用场景：
 * - 人头后侧切一圈
 * - 手臂/大腿内侧
 * - 有机形体的自然凹陷处
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param curvature_threshold 曲率阈值
 * @return UV 岛列表
 */
std::vector<UVIsland> segmentByHighCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double curvature_threshold = 0.5
);

/**
 * @brief 计算顶点的主曲率
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param principal_min 最小主曲率输出
 * @param principal_max 最大主曲率输出
 */
void computePrincipalCurvatures(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    Eigen::VectorXd& principal_min,
    Eigen::VectorXd& principal_max
);

/**
 * @brief 不可展开区域切线分割
 * 
 * 基于高斯曲率：
 * - 正高斯曲率（凸包）必需切
 * - 零高斯曲率（平面/圆柱）可展开
 * - 负高斯曲率（鞍形）通常也需要切
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param gaussian_threshold 高斯曲率阈值
 * @return UV 岛列表
 */
std::vector<UVIsland> segmentByGaussianCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double gaussian_threshold = 0.01
);

/**
 * @brief 计算高斯曲率
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @return 每个顶点的高斯曲率
 */
Eigen::VectorXd computeGaussianCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F
);

/**
 * @brief 按纹理方向切割
 * 
 * 适用场景：
 * - 衣服布纹方向
 * - 木纹方向
 * - 金属拉丝效果
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param texture_direction 纹理方向向量
 * @param angle_threshold 角度阈值
 * @return UV 岛列表
 */
std::vector<UVIsland> segmentByTextureFlow(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::Vector3d& texture_direction,
    double angle_threshold = 45.0
);

/**
 * @brief 细节区域隔离
 * 
 * 适用场景：
 * - 角色脸部单独 UV 岛
 * - 装饰花纹、logo 区域
 * - 金属刻线、复杂花纹区域
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param detail_faces 需要隔离的面索引
 * @return UV 岛列表
 */
std::vector<UVIsland> segmentByDetailIsolation(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<int>& detail_faces
);

/**
 * @brief 镜像/重复切割
 * 
 * 适用场景：
 * - 左右镜像角色
 * - 重复机械件
 * - 模块化场景
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param symmetry_plane 镜像平面 (ax + by + cz + d = 0)
 * @param tolerance 容差
 * @return UV 岛列表
 */
std::vector<UVIsland> segmentBySymmetry(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::Vector4d& symmetry_plane,
    double tolerance = 1e-6
);

} // namespace UVUnwrapping
