#include <iostream>
#include <igl/read_triangle_mesh.h>
#include "uv_segmentation.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "用法: " << argv[0] << " <mesh.obj>\n";
        return 1;
    }

    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    std::cout << "加载网格: " << argv[1] << "\n";
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格\n";
        return 1;
    }
    
    std::cout << "网格: " << V.rows() << " 顶点, " << F.rows() << " 面\n\n";
    
    // 只测试对称分割（最快）
    try {
        std::cout << "运行对称分割 (x=0平面)...\n";
        Eigen::Vector4d plane(1, 0, 0, 0);
        auto islands = UVSegmentation::segmentBySymmetry(V, F, plane, 0.01);
        
        std::cout << "\n结果:\n";
        std::cout << "  UV岛数量: " << islands.size() << "\n";
        
        int total_seams = 0;
        for (const auto& island : islands) {
            total_seams += island.boundary.size();
        }
        std::cout << "  缝合线数量: " << total_seams << "\n";
        
        std::cout << "\n每个UV岛的面数:\n";
        for (size_t i = 0; i < islands.size(); i++) {
            std::cout << "  岛 " << i << ": " << islands[i].faces.size() << " 面\n";
        }
        
    } catch (const std::exception& e) {
        std::cout << "失败: " << e.what() << "\n";
    }
    
    return 0;
}
