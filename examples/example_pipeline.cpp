#include <iostream>
#include <igl/read_triangle_mesh.h>
#include <igl/writeOBJ.h>
#include "uv_segmentation.h"
#include "uv_unwrapping.h"
#include "xatlas_wrapper.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj> [output.obj]" << std::endl;
        std::cout << "\n完整的 UV 展开流程" << std::endl;
        std::cout << "演示：分割 → 展开 → 优化 → 打包" << std::endl;
        return 1;
    }
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格文件: " << argv[1] << std::endl;
        return 1;
    }
    
    std::cout << "========================================" << std::endl;
    std::cout << "  UV 展开完整流程示例" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "\n加载网格: " << V.rows() << " 顶点, " 
              << F.rows() << " 面" << std::endl;
    
    // === 步骤 1: 网格分割 ===
    std::cout << "\n[步骤 1/4] 网格分割" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    // 尝试多种分割方法
    std::cout << "1. 边环检测..." << std::endl;
    auto edge_loops = UVUnwrapping::detectEdgeLoops(V, F, 30.0);
    std::cout << "   检测到 " << edge_loops.size() << " 个边环" << std::endl;
    
    std::cout << "2. 高斯曲率分析..." << std::endl;
    auto K = UVUnwrapping::computeGaussianCurvature(V, F);
    std::cout << "   高斯曲率范围: [" << K.minCoeff() 
              << ", " << K.maxCoeff() << "]" << std::endl;
    
    // 选择分割方法
    std::vector<UVUnwrapping::UVIsland> islands;
    
    if (edge_loops.size() > 0) {
        std::cout << "3. 使用边环分割..." << std::endl;
        islands = UVUnwrapping::segmentByEdgeLoops(V, F, edge_loops);
    } else {
        std::cout << "3. 使用高斯曲率分割..." << std::endl;
        islands = UVUnwrapping::segmentByGaussianCurvature(V, F, 0.01);
    }
    
    std::cout << "   生成 " << islands.size() << " 个 UV 岛" << std::endl;
    
    // === 步骤 2: UV 展开 ===
    std::cout << "\n[步骤 2/4] UV 展开" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    std::cout << "比较不同算法..." << std::endl;
    
    // LSCM
    std::cout << "\n  LSCM (最小二乘保角映射):" << std::endl;
    auto lscm_result = UVUnwrapping::unwrapLSCM(V, F);
    if (lscm_result.UV.rows() > 0) {
        std::cout << "    ✓ 成功" << std::endl;
        std::cout << "    失真: " << lscm_result.distortion << std::endl;
        std::cout << "    平均拉伸: " << lscm_result.stretch.mean() << std::endl;
    } else {
        std::cout << "    ✗ 失败（网格可能没有边界）" << std::endl;
    }
    
    // ABF
    std::cout << "\n  ABF (基于角度的展平):" << std::endl;
    std::cout << "    （跳过 - 计算时间较长）" << std::endl;
    // auto abf_result = UVUnwrapping::unwrapABF(V, F, 100, 1e-4);
    
    // xatlas
    std::cout << "\n  xatlas (自动化):" << std::endl;
    UVUnwrapping::XAtlasWrapper wrapper;
    UVUnwrapping::XAtlasWrapper::Options xatlas_options;
    xatlas_options.resolution = 512;
    xatlas_options.padding = 2.0f;
    
    auto [xatlas_uv, xatlas_islands] = wrapper.generate(V, F, xatlas_options);
    if (xatlas_uv.rows() > 0) {
        std::cout << "    ✓ 成功" << std::endl;
        std::cout << "    Charts: " << xatlas_islands.size() << std::endl;
        
        auto xatlas_distortion = UVUnwrapping::computeUVDistortion(V, F, xatlas_uv);
        auto xatlas_stretch = UVUnwrapping::computeStretch(V, F, xatlas_uv);
        std::cout << "    失真: " << xatlas_distortion << std::endl;
        std::cout << "    平均拉伸: " << xatlas_stretch.mean() << std::endl;
    } else {
        std::cout << "    ✗ 失败" << std::endl;
    }
    
    // 选择最佳结果
    Eigen::MatrixXd best_UV;
    std::string best_method;
    
    if (lscm_result.UV.rows() > 0 && xatlas_uv.rows() > 0) {
        if (lscm_result.distortion < UVUnwrapping::computeUVDistortion(V, F, xatlas_uv)) {
            best_UV = lscm_result.UV;
            best_method = "LSCM";
        } else {
            best_UV = xatlas_uv;
            best_method = "xatlas";
        }
    } else if (lscm_result.UV.rows() > 0) {
        best_UV = lscm_result.UV;
        best_method = "LSCM";
    } else if (xatlas_uv.rows() > 0) {
        best_UV = xatlas_uv;
        best_method = "xatlas";
    } else {
        std::cerr << "所有方法都失败了！" << std::endl;
        return 1;
    }
    
    std::cout << "\n  选择: " << best_method << std::endl;
    
    // === 步骤 3: UV 优化 ===
    std::cout << "\n[步骤 3/4] UV 优化" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    double distortion_before = UVUnwrapping::computeUVDistortion(V, F, best_UV);
    std::cout << "优化前失真: " << distortion_before << std::endl;
    
    std::cout << "应用松弛优化..." << std::endl;
    Eigen::MatrixXd UV_optimized = best_UV;
    UVUnwrapping::relaxUV(V, F, UV_optimized, 10);
    
    double distortion_after = UVUnwrapping::computeUVDistortion(V, F, UV_optimized);
    std::cout << "优化后失真: " << distortion_after << std::endl;
    
    if (distortion_after < distortion_before) {
        double improvement = (distortion_before - distortion_after) / distortion_before * 100.0;
        std::cout << "改善: " << improvement << "%" << std::endl;
        best_UV = UV_optimized;
    } else {
        std::cout << "优化未改善，保持原始结果" << std::endl;
    }
    
    // === 步骤 4: UV 打包 ===
    std::cout << "\n[步骤 4/4] UV 打包" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    // 计算 UV 空间利用率
    Eigen::Vector2d min_uv = best_UV.colwise().minCoeff();
    Eigen::Vector2d max_uv = best_UV.colwise().maxCoeff();
    
    std::cout << "UV 边界框: [" << min_uv(0) << ", " << max_uv(0) 
              << "] x [" << min_uv(1) << ", " << max_uv(1) << "]" << std::endl;
    
    double bbox_width = max_uv(0) - min_uv(0);
    double bbox_height = max_uv(1) - min_uv(1);
    std::cout << "尺寸: " << bbox_width << " x " << bbox_height << std::endl;
    
    // === 最终结果 ===
    std::cout << "\n========================================" << std::endl;
    std::cout << "  最终结果" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "使用方法: " << best_method << std::endl;
    std::cout << "UV 岛数: " << islands.size() << std::endl;
    std::cout << "最终失真: " << UVUnwrapping::computeUVDistortion(V, F, best_UV) << std::endl;
    
    auto final_stretch = UVUnwrapping::computeStretch(V, F, best_UV);
    std::cout << "拉伸范围: [" << final_stretch.minCoeff() 
              << ", " << final_stretch.maxCoeff() << "]" << std::endl;
    std::cout << "平均拉伸: " << final_stretch.mean() << std::endl;
    
    // 保存结果
    if (argc >= 3) {
        Eigen::MatrixXd UV_3d(best_UV.rows(), 3);
        UV_3d.leftCols(2) = best_UV;
        UV_3d.col(2).setZero();
        
        if (igl::writeOBJ(argv[2], V, F, Eigen::MatrixXd(), Eigen::MatrixXi(), 
                         UV_3d, F)) {
            std::cout << "\n✓ 保存到: " << argv[2] << std::endl;
        } else {
            std::cerr << "✗ 保存失败！" << std::endl;
        }
    }
    
    std::cout << "\n========================================" << std::endl;
    
    return 0;
}
