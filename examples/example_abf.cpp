#include <iostream>
#include <igl/read_triangle_mesh.h>
#include <igl/writeOBJ.h>
#include "uv_unwrapping.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj> [output.obj]" << std::endl;
        std::cout << "\n示例：ABF（基于角度的展平）UV 展开" << std::endl;
        std::cout << "特点：更少的拉伸、更均匀的 UV" << std::endl;
        std::cout << "适用于：高精模型、需要极高质量纹理 UV" << std::endl;
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
    
    // 应用 ABF
    std::cout << "\n运行 ABF 算法..." << std::endl;
    std::cout << "（这可能需要较长时间...）" << std::endl;
    
    int max_iterations = 1000;
    double tolerance = 1e-6;
    
    auto result = UVUnwrapping::unwrapABF(V, F, max_iterations, tolerance);
    
    if (result.UV.rows() == 0) {
        std::cerr << "ABF 失败！" << std::endl;
        return 1;
    }
    
    std::cout << "ABF 成功！" << std::endl;
    
    // 分析结果
    std::cout << "\n=== UV 质量分析 ===" << std::endl;
    std::cout << "失真度量: " << result.distortion << std::endl;
    
    if (result.stretch.size() > 0) {
        std::cout << "\n拉伸统计：" << std::endl;
        std::cout << "  最小: " << result.stretch.minCoeff() << std::endl;
        std::cout << "  最大: " << result.stretch.maxCoeff() << std::endl;
        std::cout << "  平均: " << result.stretch.mean() << std::endl;
        // 计算中位数
        Eigen::VectorXd sorted = result.stretch;
        std::sort(sorted.data(), sorted.data() + sorted.size());
        double median = sorted.size() % 2 == 0 
            ? (sorted(sorted.size()/2 - 1) + sorted(sorted.size()/2)) / 2.0
            : sorted(sorted.size()/2);
        std::cout << "  中位数: " << median << std::endl;
        
        // 统计拉伸分布
        int count_1x = 0, count_2x = 0, count_3x = 0;
        for (int i = 0; i < result.stretch.size(); ++i) {
            if (result.stretch(i) < 1.5) ++count_1x;
            else if (result.stretch(i) < 2.5) ++count_2x;
            else ++count_3x;
        }
        
        std::cout << "\n拉伸分布：" << std::endl;
        std::cout << "  < 1.5x: " << count_1x << " (" 
                  << (100.0 * count_1x / F.rows()) << "%)" << std::endl;
        std::cout << "  1.5-2.5x: " << count_2x << " (" 
                  << (100.0 * count_2x / F.rows()) << "%)" << std::endl;
        std::cout << "  > 2.5x: " << count_3x << " (" 
                  << (100.0 * count_3x / F.rows()) << "%)" << std::endl;
    }
    
    // 与 LSCM 比较
    std::cout << "\n=== 与 LSCM 比较 ===" << std::endl;
    auto lscm_result = UVUnwrapping::unwrapLSCM(V, F);
    
    if (lscm_result.UV.rows() > 0) {
        std::cout << "LSCM 失真: " << lscm_result.distortion << std::endl;
        std::cout << "ABF 失真:  " << result.distortion << std::endl;
        
        if (result.distortion < lscm_result.distortion) {
            double improvement = (lscm_result.distortion - result.distortion) / 
                               lscm_result.distortion * 100.0;
            std::cout << "ABF 改善: " << improvement << "%" << std::endl;
        }
    }
    
    // 保存结果
    if (argc >= 3) {
        Eigen::MatrixXd UV_3d(result.UV.rows(), 3);
        UV_3d.leftCols(2) = result.UV;
        UV_3d.col(2).setZero();
        
        if (igl::writeOBJ(argv[2], V, F, Eigen::MatrixXd(), Eigen::MatrixXi(), 
                         UV_3d, F)) {
            std::cout << "\n保存到: " << argv[2] << std::endl;
        } else {
            std::cerr << "保存失败！" << std::endl;
        }
    }
    
    std::cout << "\n=== ABF/ABF++ 特点 ===" << std::endl;
    std::cout << "优点：" << std::endl;
    std::cout << "  ✓ 更少的拉伸（比 LSCM 更优）" << std::endl;
    std::cout << "  ✓ 更均匀的 UV 分布" << std::endl;
    std::cout << "  ✓ 理论上最优的角度保持" << std::endl;
    std::cout << "\n缺点：" << std::endl;
    std::cout << "  ✗ 计算时间较长" << std::endl;
    std::cout << "  ✗ 需要迭代优化" << std::endl;
    std::cout << "\n适用场景：" << std::endl;
    std::cout << "  • 高精模型" << std::endl;
    std::cout << "  • 需要极高质量纹理 UV" << std::endl;
    std::cout << "  • 离线渲染" << std::endl;
    std::cout << "  • 重要的主角资产" << std::endl;
    
    std::cout << "\n参考：" << std::endl;
    std::cout << "  https://github.com/educelab/OpenABF" << std::endl;
    std::cout << "  Paper: Sheffer et al., \"ABF++: Fast and Robust Angle Based Flattening\", 2005" << std::endl;
    
    return 0;
}
