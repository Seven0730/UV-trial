#include <iostream>
#include <igl/read_triangle_mesh.h>
#include <igl/write_triangle_mesh.h>
#include "uv_segmentation.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj>" << std::endl;
        std::cout << "\n示例：按拓扑环（Edge Loop）分割网格" << std::endl;
        std::cout << "适用于：角色脖子、衣服袖口、裤脚、机械部件接合处" << std::endl;
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
    
    // 检测边环
    std::cout << "\n检测特征边环..." << std::endl;
    double feature_angle = 30.0;  // 30度阈值
    auto edge_loops = UVUnwrapping::detectEdgeLoops(V, F, feature_angle);
    
    std::cout << "检测到 " << edge_loops.size() << " 个边环:" << std::endl;
    for (size_t i = 0; i < edge_loops.size(); ++i) {
        std::cout << "  边环 " << i << ": " << edge_loops[i].size() 
                  << " 个顶点" << std::endl;
    }
    
    // 使用边环分割网格
    std::cout << "\n按边环分割网格..." << std::endl;
    auto islands = UVUnwrapping::segmentByEdgeLoops(V, F, edge_loops);
    
    std::cout << "生成 " << islands.size() << " 个 UV 岛:" << std::endl;
    for (size_t i = 0; i < islands.size(); ++i) {
        std::cout << "  UV 岛 " << i << ":" << std::endl;
        std::cout << "    面数: " << islands[i].faces.size() << std::endl;
        std::cout << "    面积: " << islands[i].area << std::endl;
        std::cout << "    质心: (" << islands[i].centroid.transpose() << ")" << std::endl;
        std::cout << "    边界边数: " << islands[i].boundary.size() << std::endl;
    }
    
    std::cout << "\n优点：" << std::endl;
    std::cout << "  ✓ UV 形状规整" << std::endl;
    std::cout << "  ✓ 容易 relax 和 pack" << std::endl;
    std::cout << "  ✓ 适合机械部件和规则形状" << std::endl;
    
    return 0;
}
