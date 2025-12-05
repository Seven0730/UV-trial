#pragma once

#include <Eigen/Core>
#include "uv_segmentation.h"

namespace UVUnwrapping {

/**
 * @brief UVAtlas 库包装器
 * 
 * GitHub: https://github.com/Microsoft/UVAtlas
 * 
 * 特点：
 * - 支持图形硬件加速
 * - 有 Chart 分割（等价 seam 自动切）
 * - 有 LSCM/Stretch 分析
 */
class UVAtlasWrapper {
public:
    /**
     * @brief UVAtlas 参数配置
     */
    struct Options {
        // Chart 分割参数
        int max_charts = 0;                   // 0 表示自动决定
        float max_stretch = 0.16667f;         // 最大拉伸值 [0, 1]
        int width = 512;                      // 图集宽度
        int height = 512;                     // 图集高度
        float gutter = 2.0f;                  // UV 岛之间的间隔（像素）
        
        // 质量参数
        bool geodesic = true;                 // 使用测地距离
        int max_iterations = 10;              // 最大迭代次数
        
        // IMT (Integrated Metric Tensor) 参数
        bool use_imt = false;                 // 使用 IMT 进行各向异性缩放
        bool per_vertex_imt = false;          // 每顶点 IMT vs 每面 IMT
    };

    UVAtlasWrapper();
    ~UVAtlasWrapper();

    /**
     * @brief 生成 UV atlas
     * 
     * @param V 顶点矩阵
     * @param F 面矩阵
     * @param options UVAtlas 参数
     * @return UV 坐标和岛信息
     */
    std::pair<Eigen::MatrixXd, std::vector<UVIsland>> generate(
        const Eigen::MatrixXd& V,
        const Eigen::MatrixXi& F,
        const Options& options = Options()
    );

    /**
     * @brief 使用 IMT 生成 UV
     * 
     * IMT 允许指定各向异性缩放，适用于：
     * - 需要方向性纹理的模型
     * - 需要不同区域不同密度的模型
     * 
     * @param V 顶点矩阵
     * @param F 面矩阵
     * @param IMT Integrated Metric Tensor (3x3 矩阵每个面或顶点)
     * @param options UVAtlas 参数
     * @return UV 坐标和岛信息
     */
    std::pair<Eigen::MatrixXd, std::vector<UVIsland>> generateWithIMT(
        const Eigen::MatrixXd& V,
        const Eigen::MatrixXi& F,
        const std::vector<Eigen::Matrix3d>& IMT,
        const Options& options = Options()
    );

    /**
     * @brief 计算拉伸度量
     * 
     * @param V 顶点矩阵
     * @param F 面矩阵
     * @param UV UV 坐标
     * @return 拉伸度量（L2 和 L∞ 拉伸）
     */
    std::pair<double, double> computeStretch(
        const Eigen::MatrixXd& V,
        const Eigen::MatrixXi& F,
        const Eigen::MatrixXd& UV
    );

private:
    class Impl;
    Impl* impl_;
};

} // namespace UVUnwrapping
