#include <iostream>
#include <igl/read_triangle_mesh.h>
#include "uv_segmentation.h"
#include "uv_unwrapping.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj>" << std::endl;
        std::cout << "\n示例：基于曲率的网格分割" << std::endl;
        std::cout << "适用于：有机形体、人头、手臂、腿部、动物角色" << std::endl;
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
    
    // 1. 高曲率切线分割
    std::cout << "\n=== 方法1：高曲率切线分割 ===" << std::endl;
    std::cout << "适合：圆润物体、人头后侧、手臂内侧" << std::endl;
    
    double curvature_threshold = 0.5;
    auto curvature_islands = UVUnwrapping::segmentByHighCurvature(
        V, F, curvature_threshold
    );
    
    std::cout << "生成 " << curvature_islands.size() << " 个 UV 岛" << std::endl;
    
    std::cout << "\n优点：" << std::endl;
    std::cout << "  ✓ 释放曲面拉伸，减少 UV 扭曲" << std::endl;
    std::cout << "缺点：" << std::endl;
    std::cout << "  ✗ seam 位置不一定隐蔽" << std::endl;
    
    // 2. 不可展开区域切线（高斯曲率）
    std::cout << "\n=== 方法2：不可展开区域切线（高斯曲率）===" << std::endl;
    std::cout << "数学原理：" << std::endl;
    std::cout << "  • 正高斯曲率（凸包）→ 必需切" << std::endl;
    std::cout << "  • 零高斯曲率（平面/圆柱）→ 可展开" << std::endl;
    std::cout << "  • 负高斯曲率（鞍形）→ 通常需要切" << std::endl;
    
    // 计算高斯曲率
    auto K = UVUnwrapping::computeGaussianCurvature(V, F);
    
    std::cout << "\n高斯曲率统计：" << std::endl;
    std::cout << "  最小: " << K.minCoeff() << std::endl;
    std::cout << "  最大: " << K.maxCoeff() << std::endl;
    std::cout << "  平均: " << K.mean() << std::endl;
    
    double gaussian_threshold = 0.01;
    auto gaussian_islands = UVUnwrapping::segmentByGaussianCurvature(
        V, F, gaussian_threshold
    );
    
    std::cout << "生成 " << gaussian_islands.size() << " 个 UV 岛" << std::endl;
    
    std::cout << "\n优点：" << std::endl;
    std::cout << "  ✓ 获得最平滑的 UV" << std::endl;
    std::cout << "  ✓ 数学上最优" << std::endl;
    std::cout << "缺点：" << std::endl;
    std::cout << "  ✗ seam 较多，但可被纹理隐藏" << std::endl;
    
    // 3. 主曲率分析
    std::cout << "\n=== 主曲率分析 ===" << std::endl;
    Eigen::VectorXd K_min, K_max;
    UVUnwrapping::computePrincipalCurvatures(V, F, K_min, K_max);
    
    std::cout << "最小主曲率范围: [" << K_min.minCoeff() 
              << ", " << K_min.maxCoeff() << "]" << std::endl;
    std::cout << "最大主曲率范围: [" << K_max.minCoeff() 
              << ", " << K_max.maxCoeff() << "]" << std::endl;
    
    return 0;
}
