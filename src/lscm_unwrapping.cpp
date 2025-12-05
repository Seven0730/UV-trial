#include "uv_unwrapping.h"
#include <igl/boundary_loop.h>
#include <igl/map_vertices_to_circle.h>
#include <igl/harmonic.h>
#include <igl/lscm.h>
#include <igl/doublearea.h>
#include <igl/arap.h>
#include <Eigen/Sparse>
#include <iostream>

namespace UVUnwrapping {

double computeUVDistortion(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::MatrixXd& UV
) {
    double total_distortion = 0.0;
    
    for (int i = 0; i < F.rows(); ++i) {
        // 3D 三角形
        Eigen::Vector3d v0_3d = V.row(F(i, 0));
        Eigen::Vector3d v1_3d = V.row(F(i, 1));
        Eigen::Vector3d v2_3d = V.row(F(i, 2));
        
        Eigen::Vector3d e1_3d = v1_3d - v0_3d;
        Eigen::Vector3d e2_3d = v2_3d - v0_3d;
        
        double area_3d = 0.5 * e1_3d.cross(e2_3d).norm();
        
        // UV 三角形
        Eigen::Vector2d v0_uv = UV.row(F(i, 0));
        Eigen::Vector2d v1_uv = UV.row(F(i, 1));
        Eigen::Vector2d v2_uv = UV.row(F(i, 2));
        
        Eigen::Vector2d e1_uv = v1_uv - v0_uv;
        Eigen::Vector2d e2_uv = v2_uv - v0_uv;
        
        double area_uv = 0.5 * std::abs(e1_uv.x() * e2_uv.y() - e1_uv.y() * e2_uv.x());
        
        if (area_3d > 1e-10 && area_uv > 1e-10) {
            // 计算各向异性能量
            double ratio = area_uv / area_3d;
            total_distortion += area_3d * (ratio + 1.0 / ratio - 2.0);
        }
    }
    
    return total_distortion;
}

Eigen::VectorXd computeStretch(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::MatrixXd& UV
) {
    Eigen::VectorXd stretch(F.rows());
    
    for (int i = 0; i < F.rows(); ++i) {
        // 3D 边
        Eigen::Vector3d v0_3d = V.row(F(i, 0));
        Eigen::Vector3d v1_3d = V.row(F(i, 1));
        Eigen::Vector3d v2_3d = V.row(F(i, 2));
        
        Eigen::Vector3d e1_3d = v1_3d - v0_3d;
        Eigen::Vector3d e2_3d = v2_3d - v0_3d;
        Eigen::Vector3d e3_3d = v2_3d - v1_3d;
        
        // UV 边
        Eigen::Vector2d v0_uv = UV.row(F(i, 0));
        Eigen::Vector2d v1_uv = UV.row(F(i, 1));
        Eigen::Vector2d v2_uv = UV.row(F(i, 2));
        
        Eigen::Vector2d e1_uv = v1_uv - v0_uv;
        Eigen::Vector2d e2_uv = v2_uv - v0_uv;
        Eigen::Vector2d e3_uv = v2_uv - v1_uv;
        
        // 计算拉伸比
        double s1 = e1_uv.norm() / e1_3d.norm();
        double s2 = e2_uv.norm() / e2_3d.norm();
        double s3 = e3_uv.norm() / e3_3d.norm();
        
        stretch(i) = std::max({s1, s2, s3}) / std::min({s1, s2, s3});
    }
    
    return stretch;
}

UVResult unwrapLSCM(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<int>& boundary_indices
) {
    UVResult result;
    
    // 找边界
    std::vector<std::vector<int>> boundaries;
    igl::boundary_loop(F, boundaries);
    
    if (boundaries.empty()) {
        std::cerr << "Error: No boundary found. Mesh must have boundary for LSCM." << std::endl;
        result.UV = Eigen::MatrixXd::Zero(V.rows(), 2);
        result.distortion = std::numeric_limits<double>::infinity();
        return result;
    }
    
    // 使用最长的边界
    std::vector<int> bnd = boundaries[0];
    for (size_t i = 1; i < boundaries.size(); ++i) {
        if (boundaries[i].size() > bnd.size()) {
            bnd = boundaries[i];
        }
    }
    
    // 如果提供了边界索引，使用它们
    if (!boundary_indices.empty()) {
        bnd = boundary_indices;
    }
    
    // 固定两个边界点
    Eigen::VectorXi b(2);
    b(0) = bnd[0];
    b(1) = bnd[bnd.size() / 2];
    
    Eigen::MatrixXd bc(2, 2);
    bc << 0, 0,
          1, 0;
    
    // 运行 LSCM
    result.UV.resize(V.rows(), 2);
    bool success = igl::lscm(V, F, b, bc, result.UV);
    
    if (!success) {
        std::cerr << "LSCM failed!" << std::endl;
        result.distortion = std::numeric_limits<double>::infinity();
        return result;
    }
    
    // 归一化 UV 到 [0, 1]
    Eigen::Vector2d min_uv = result.UV.colwise().minCoeff();
    Eigen::Vector2d max_uv = result.UV.colwise().maxCoeff();
    Eigen::Vector2d range = max_uv - min_uv;
    
    for (int i = 0; i < result.UV.rows(); ++i) {
        result.UV(i, 0) = (result.UV(i, 0) - min_uv(0)) / range(0);
        result.UV(i, 1) = (result.UV(i, 1) - min_uv(1)) / range(1);
    }
    
    // 计算失真
    result.distortion = computeUVDistortion(V, F, result.UV);
    result.stretch = computeStretch(V, F, result.UV);
    
    return result;
}

Eigen::MatrixXd unwrapIslandLSCM(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const UVIsland& island
) {
    // 创建岛的子网格
    Eigen::MatrixXd V_island(V.rows(), 3);
    Eigen::MatrixXi F_island(island.faces.size(), 3);
    
    std::map<int, int> old_to_new;
    int new_idx = 0;
    
    for (size_t i = 0; i < island.faces.size(); ++i) {
        int fi = island.faces[i];
        for (int j = 0; j < 3; ++j) {
            int vi = F(fi, j);
            if (old_to_new.find(vi) == old_to_new.end()) {
                old_to_new[vi] = new_idx;
                V_island.row(new_idx) = V.row(vi);
                ++new_idx;
            }
            F_island(i, j) = old_to_new[vi];
        }
    }
    
    V_island.conservativeResize(new_idx, 3);
    
    // 应用 LSCM
    UVResult uv_result = unwrapLSCM(V_island, F_island);
    
    // 映射回原始索引
    Eigen::MatrixXd UV(V.rows(), 2);
    UV.setZero();
    
    for (const auto& pair : old_to_new) {
        UV.row(pair.first) = uv_result.UV.row(pair.second);
    }
    
    return UV;
}

void relaxUV(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    Eigen::MatrixXd& UV,
    int iterations
) {
    // 使用 ARAP (As-Rigid-As-Possible) 进行松弛
    igl::ARAPData arap_data;
    arap_data.max_iter = iterations;
    
    // 找边界顶点
    std::vector<std::vector<int>> boundaries;
    igl::boundary_loop(F, boundaries);
    
    if (boundaries.empty()) {
        return;  // 没有边界，无法松弛
    }
    
    Eigen::VectorXi b(boundaries[0].size());
    Eigen::MatrixXd bc(boundaries[0].size(), 2);
    
    for (size_t i = 0; i < boundaries[0].size(); ++i) {
        b(i) = boundaries[0][i];
        bc.row(i) = UV.row(boundaries[0][i]);
    }
    
    // 预计算
    igl::arap_precomputation(V, F, 2, b, arap_data);
    
    // 优化
    Eigen::MatrixXd UV_new = UV;
    igl::arap_solve(bc, arap_data, UV_new);
    
    UV = UV_new;
}

Eigen::MatrixXd packUVIslands(
    const std::vector<UVIsland>& islands,
    const std::vector<Eigen::MatrixXd>& UV_coords,
    double padding
) {
    if (islands.empty() || UV_coords.empty()) {
        return Eigen::MatrixXd();
    }
    
    // 计算每个岛的边界框
    struct BoundingBox {
        Eigen::Vector2d min;
        Eigen::Vector2d max;
        Eigen::Vector2d size;
        int island_idx;
    };
    
    std::vector<BoundingBox> boxes;
    for (size_t i = 0; i < islands.size(); ++i) {
        BoundingBox box;
        box.island_idx = i;
        
        // 找最小和最大 UV
        box.min = Eigen::Vector2d(1e10, 1e10);
        box.max = Eigen::Vector2d(-1e10, -1e10);
        
        for (int fi : islands[i].faces) {
            for (int j = 0; j < 3; ++j) {
                // 这里需要根据实际的顶点索引
                // 简化处理：假设 UV_coords[i] 包含该岛的所有顶点
            }
        }
        
        // 暂时使用 UV_coords 的边界
        if (UV_coords[i].rows() > 0) {
            box.min = UV_coords[i].colwise().minCoeff();
            box.max = UV_coords[i].colwise().maxCoeff();
            box.size = box.max - box.min;
            boxes.push_back(box);
        }
    }
    
    // 按面积排序（从大到小）
    std::sort(boxes.begin(), boxes.end(), [](const BoundingBox& a, const BoundingBox& b) {
        return (a.size.x() * a.size.y()) > (b.size.x() * b.size.y());
    });
    
    // 简单的矩形打包算法
    std::vector<Eigen::Vector2d> positions(islands.size());
    double current_x = 0;
    double current_y = 0;
    double row_height = 0;
    double max_width = 1.0;  // 目标宽度
    
    for (const auto& box : boxes) {
        double width = box.size.x() + padding;
        double height = box.size.y() + padding;
        
        if (current_x + width > max_width && current_x > 0) {
            // 换行
            current_x = 0;
            current_y += row_height + padding;
            row_height = 0;
        }
        
        positions[box.island_idx] = Eigen::Vector2d(current_x, current_y);
        current_x += width;
        row_height = std::max(row_height, height);
    }
    
    // 应用位置到 UV
    Eigen::MatrixXd UV_packed = UV_coords[0];  // 初始化
    for (size_t i = 0; i < islands.size(); ++i) {
        Eigen::Vector2d offset = positions[i] - boxes[i].min;
        for (int row = 0; row < UV_coords[i].rows(); ++row) {
            UV_packed.row(row) = UV_coords[i].row(row) + offset.transpose();
        }
    }
    
    return UV_packed;
}

} // namespace UVUnwrapping
