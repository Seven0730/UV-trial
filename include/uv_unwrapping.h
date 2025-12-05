#pragma once

#include <Eigen/Core>
#include <Eigen/Sparse>
#include "uv_segmentation.h"

namespace UVUnwrapping {

/**
 * @brief UV 坐标结果
 */
struct UVResult {
    Eigen::MatrixXd UV;              // UV 坐标 (n x 2)
    std::vector<UVIsland> islands;   // UV 岛信息
    double distortion;               // 失真度量
    Eigen::VectorXd stretch;         // 每个面的拉伸值
};

/**
 * @brief LSCM（Least Squares Conformal Maps）最小二乘保角映射
 * 
 * 特点：
 * - 尽量保持三角形角度不变（保角）
 * - 拉伸少
 * - 展开速度快
 * 
 * 适用：角色类模型、有曲面结构的物体
 * 
 * @param V 顶点矩阵 (n x 3)
 * @param F 面矩阵 (m x 3)
 * @param boundary_indices 边界顶点索引
 * @return UV 坐标结果
 */
UVResult unwrapLSCM(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<int>& boundary_indices = {}
);

/**
 * @brief LSCM 展开单个 UV 岛
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param island UV 岛信息
 * @return UV 坐标 (n x 2)
 */
Eigen::MatrixXd unwrapIslandLSCM(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const UVIsland& island
);

/**
 * @brief ABF（Angle Based Flattening）基于角度的展平
 * 
 * 特点：
 * - 更少的拉伸
 * - 更均匀的 UV
 * 
 * 适用：高精模型、需要极高质量纹理 UV
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param max_iterations 最大迭代次数
 * @param tolerance 收敛容差
 * @return UV 坐标结果
 */
UVResult unwrapABF(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    int max_iterations = 1000,
    double tolerance = 1e-6
);

/**
 * @brief ABF++ 改进算法
 * 
 * @param V 顶点矩阵
 * @param F 面矩阵
 * @param max_iterations 最大迭代次数
 * @param tolerance 收敛容差
 * @return UV 坐标结果
 */
UVResult unwrapABFPlusPlus(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    int max_iterations = 1000,
    double tolerance = 1e-6
);

/**
 * @brief 计算 UV 失真
 * 
 * @param V 3D 顶点矩阵
 * @param F 面矩阵
 * @param UV UV 坐标矩阵
 * @return 失真度量（各向异性能量）
 */
double computeUVDistortion(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::MatrixXd& UV
);

/**
 * @brief 计算每个面的拉伸值
 * 
 * @param V 3D 顶点矩阵
 * @param F 面矩阵
 * @param UV UV 坐标矩阵
 * @return 每个面的拉伸值向量
 */
Eigen::VectorXd computeStretch(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::MatrixXd& UV
);

/**
 * @brief UV 松弛优化
 * 
 * 减少失真，使 UV 更均匀
 * 
 * @param V 3D 顶点矩阵
 * @param F 面矩阵
 * @param UV 输入输出 UV 坐标
 * @param iterations 迭代次数
 */
void relaxUV(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    Eigen::MatrixXd& UV,
    int iterations = 10
);

/**
 * @brief UV 打包（Packing）
 * 
 * 将多个 UV 岛紧密排列在 [0,1] 空间内
 * 
 * @param islands UV 岛列表
 * @param UV_coords 各 UV 岛的坐标
 * @param padding UV 岛之间的间距
 * @return 打包后的 UV 坐标
 */
Eigen::MatrixXd packUVIslands(
    const std::vector<UVIsland>& islands,
    const std::vector<Eigen::MatrixXd>& UV_coords,
    double padding = 0.01
);

} // namespace UVUnwrapping
