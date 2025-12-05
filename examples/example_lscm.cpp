#include <iostream>
#include <igl/read_triangle_mesh.h>
#include <igl/writeOBJ.h>
#include "uv_unwrapping.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj> [output.obj]" << std::endl;
        std::cout << "\n示例：LSCM（最小二乘保角映射）UV 展开" << std::endl;
        std::cout << "特点：保持角度、拉伸少、速度快" << std::endl;
        std::cout << "适用于：角色模型、有曲面结构的物体" << std::endl;
        return 1;
    }
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格文件: " << argv[1] << std::endl;
        return 1;
    }
    
    std::cout << "加载网格: " << V.rows() << " 顶点, " 
              << F.rows() << " 面" << std::endl;
    
    // 应用 LSCM
    std::cout << "\n运行 LSCM 算法..." << std::endl;
    auto result = UVUnwrapping::unwrapLSCM(V, F);
    
    if (result.UV.rows() == 0) {
        std::cerr << "LSCM 失败！" << std::endl;
        return 1;
    }
    
    std::cout << "LSCM 成功！" << std::endl;
    
    // 分析结果
    std::cout << "\n=== UV 质量分析 ===" << std::endl;
    std::cout << "失真度量: " << result.distortion << std::endl;
    
    if (result.stretch.size() > 0) {
        std::cout << "\n拉伸统计：" << std::endl;
        std::cout << "  最小: " << result.stretch.minCoeff() << std::endl;
        std::cout << "  最大: " << result.stretch.maxCoeff() << std::endl;
        std::cout << "  平均: " << result.stretch.mean() << std::endl;
        
        // 统计高拉伸面
        int high_stretch_count = 0;
        for (int i = 0; i < result.stretch.size(); ++i) {
            if (result.stretch(i) > 2.0) {
                ++high_stretch_count;
            }
        }
        std::cout << "  高拉伸面 (>2x): " << high_stretch_count 
                  << " (" << (100.0 * high_stretch_count / F.rows()) 
                  << "%)" << std::endl;
    }
    
    // UV 松弛优化
    std::cout << "\n应用 UV 松弛优化..." << std::endl;
    Eigen::MatrixXd UV_relaxed = result.UV;
    UVUnwrapping::relaxUV(V, F, UV_relaxed, 10);
    
    double distortion_after = UVUnwrapping::computeUVDistortion(V, F, UV_relaxed);
    std::cout << "优化后失真: " << distortion_after << std::endl;
    std::cout << "改善: " << ((result.distortion - distortion_after) / result.distortion * 100.0) 
              << "%" << std::endl;
    
    // 保存结果
    if (argc >= 3) {
        // 创建带 UV 的网格
        Eigen::MatrixXd V_out = V;
        Eigen::MatrixXd UV_out = UV_relaxed;
        
        // 添加 z=0 使其成为 3D
        Eigen::MatrixXd UV_3d(UV_out.rows(), 3);
        UV_3d.leftCols(2) = UV_out;
        UV_3d.col(2).setZero();
        
        if (igl::writeOBJ(argv[2], V_out, F, Eigen::MatrixXd(), Eigen::MatrixXi(), 
                         UV_3d, F)) {
            std::cout << "\n保存到: " << argv[2] << std::endl;
        } else {
            std::cerr << "保存失败！" << std::endl;
        }
    }
    
    std::cout << "\n=== LSCM 特点 ===" << std::endl;
    std::cout << "优点：" << std::endl;
    std::cout << "  ✓ 保持三角形角度（保角）" << std::endl;
    std::cout << "  ✓ 拉伸少" << std::endl;
    std::cout << "  ✓ 展开速度快" << std::endl;
    std::cout << "  ✓ 数学原理清晰" << std::endl;
    std::cout << "\n适用场景：" << std::endl;
    std::cout << "  • 角色类模型" << std::endl;
    std::cout << "  • 有曲面结构的物体" << std::endl;
    std::cout << "  • 需要快速展开的情况" << std::endl;
    
    std::cout << "\n参考：" << std::endl;
    std::cout << "  https://github.com/libigl/libigl/blob/main/tutorial/502_LSCMParam/main.cpp" << std::endl;
    
    return 0;
}
