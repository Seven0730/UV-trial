#pragma once

#include <Eigen/Core>
#include "uv_segmentation.h"

namespace UVUnwrapping {

/**
 * @brief xatlas 库包装器
 * 
 * GitHub: https://github.com/jpcy/xatlas
 * 
 * 功能：
 * - 自动 seam 生成
 * - LSCM 展开
 * - 自动 pack
 * - 支持 WebAssembly
 */
class XAtlasWrapper {
public:
    /**
     * @brief xatlas 参数配置
     */
    struct Options {
        // Chart 生成参数
        float max_chart_area = 0.0f;         // 0 表示无限制
        float max_boundary_length = 0.0f;    // 0 表示无限制
        float normal_deviation_weight = 2.0f; // [0, 1]
        float roundness_weight = 0.01f;       // [0, 1]
        float straightness_weight = 6.0f;     // [0, 1]
        float normal_seam_weight = 4.0f;      // [0, 1]
        float texture_seam_weight = 0.5f;     // [0, 1]
        float max_cost = 2.0f;
        int max_iterations = 1;
        
        // Pack 参数
        int resolution = 1024;                // 输出纹理分辨率
        float padding = 1.0f;                 // UV 岛之间的像素间距
        bool bilinear = true;                 // 双线性过滤
        bool block_align = false;             // 块对齐
        bool brute_force = false;             // 暴力搜索
        int max_charts_per_atlas = 0;         // 0 表示无限制
    };

    XAtlasWrapper();
    ~XAtlasWrapper();

    /**
     * @brief 自动生成 UV
     * 
     * @param V 顶点矩阵
     * @param F 面矩阵
     * @param options xatlas 参数
     * @return UV 坐标和岛信息
     */
    std::pair<Eigen::MatrixXd, std::vector<UVIsland>> generate(
        const Eigen::MatrixXd& V,
        const Eigen::MatrixXi& F,
        const Options& options
    );
    
    std::pair<Eigen::MatrixXd, std::vector<UVIsland>> generate(
        const Eigen::MatrixXd& V,
        const Eigen::MatrixXi& F
    );

    /**
     * @brief 带纹理坐标的生成（用于重新打包现有 UV）
     * 
     * @param V 顶点矩阵
     * @param F 面矩阵
     * @param UV 现有 UV 坐标
     * @param options xatlas 参数
     * @return 新的 UV 坐标和岛信息
     */
    std::pair<Eigen::MatrixXd, std::vector<UVIsland>> repack(
        const Eigen::MatrixXd& V,
        const Eigen::MatrixXi& F,
        const Eigen::MatrixXd& UV,
        const Options& options
    );

private:
    class Impl;
    Impl* impl_;
};

} // namespace UVUnwrapping
